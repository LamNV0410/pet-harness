// Workflow engine + orchestrator (03, TD-08). Deterministic: no LLM decides what happens next.
// inbox → analysis(BA) → gate1 → design(Architect) → gate2 → build(BE/FE) → verify → gate4 → done
import { join } from "node:path";
import type {
  Activity,
  AgentRole,
  AgentRun,
  Artifact,
  Stage,
  Task,
  WorkItem,
  WorkItemDetail,
  WorkItemStatus,
} from "@harness/shared";
import type { AgentExecutor } from "../agents/executor.js";
import {
  architectPrompt,
  baPrompt,
  implementPrompt,
  parseTasks,
  rolePrompt,
} from "../agents/prompts.js";
import type { ApprovalService } from "../approvals/index.js";
import type { Logger } from "../logger.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Runner } from "../runtime/runner.js";
import {
  addBranchWorktree,
  addWorktree,
  commitAll,
  diffBetween,
  fetchOrigin,
  removeWorktree,
  resolveSha,
  stripSecrets,
} from "../runtime/worktrees.js";
import type { Store } from "../store/index.js";

const MAX_AGENTS = 2;
const READ_TOOLS = ["Read", "Grep", "Glob"];
const WRITE_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "MultiEdit"];

interface WiRow {
  id: string;
  seq: number;
  title: string;
  description: string;
  project_id: string;
  stage: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const toWi = (r: WiRow): WorkItem => ({
  id: r.id,
  title: r.title,
  description: r.description,
  projectId: r.project_id,
  stage: r.stage as Stage,
  status: r.status as WorkItemStatus,
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class WorkflowError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "VALIDATION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export class Workflow {
  private agentSlots = 0;
  private readonly agentQueue: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly projects: ProjectRegistry,
    private readonly runner: Runner,
    private readonly approvals: ApprovalService,
    private readonly executor: AgentExecutor,
    private readonly logger: Logger,
    private readonly harnessRoot: string,
    private readonly home: string,
  ) {}

  // ---- queries ------------------------------------------------------------------------------
  list(): WorkItem[] {
    return (
      this.store.db
        .prepare("SELECT * FROM work_items ORDER BY seq DESC")
        .all() as unknown as WiRow[]
    ).map(toWi);
  }

  get(id: string): WorkItem | null {
    const r = this.store.db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as
      | WiRow
      | undefined;
    return r ? toWi(r) : null;
  }

  detail(id: string): WorkItemDetail {
    const wi = this.get(id);
    if (!wi) throw new WorkflowError("NOT_FOUND", "unknown work item");
    const artifacts = (
      this.store.db
        .prepare("SELECT * FROM artifacts WHERE work_item_id = ? ORDER BY id")
        .all(id) as Record<string, unknown>[]
    ).map(
      (a): Artifact => ({
        kind: String(a.kind),
        title: String(a.title),
        content: String(a.content),
        createdAt: String(a.created_at),
        agentRunId: (a.agent_run_id as string | null) ?? null,
      }),
    );
    const pending = this.approvals.list("pending").find((a) => a.subjectId === `wi:${id}`);
    return {
      workItem: wi,
      artifacts,
      tasks: this.tasks(id),
      agentRuns: this.agentRuns(id),
      runs: this.runner.listForWorkItem(id),
      pendingApprovalId: pending?.id ?? null,
    };
  }

  tasks(workItemId: string): Task[] {
    return (
      this.store.db
        .prepare("SELECT * FROM tasks WHERE work_item_id = ? ORDER BY id")
        .all(workItemId) as Record<string, unknown>[]
    ).map(
      (t): Task => ({
        id: String(t.id),
        workItemId: String(t.work_item_id),
        owner: t.owner as AgentRole,
        projectId: String(t.project_id),
        title: String(t.title),
        details: String(t.details),
        status: t.status as Task["status"],
        branch: (t.branch as string | null) ?? null,
        commit: (t.commit_sha as string | null) ?? null,
        baseSha: (t.base_sha as string | null) ?? null,
      }),
    );
  }

  agentRuns(workItemId?: string, limit = 100): AgentRun[] {
    const rows = (
      workItemId
        ? this.store.db
            .prepare("SELECT * FROM agent_runs WHERE work_item_id = ? ORDER BY created_at")
            .all(workItemId)
        : this.store.db
            .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?")
            .all(limit)
    ) as Record<string, unknown>[];
    return rows.map(toAgentRun);
  }

  agentRunDetail(id: string): { agentRun: AgentRun; activity: Activity[]; output: string | null } {
    const r = this.store.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) throw new WorkflowError("NOT_FOUND", "unknown agent run");
    const activity = (
      this.store.db
        .prepare("SELECT ts, kind, text FROM agent_activity WHERE agent_run_id = ? ORDER BY id")
        .all(id) as Record<string, unknown>[]
    ).map(
      (a): Activity => ({
        ts: String(a.ts),
        kind: a.kind as Activity["kind"],
        text: String(a.text),
      }),
    );
    return { agentRun: toAgentRun(r), activity, output: (r.output as string | null) ?? null };
  }

  async diff(id: string) {
    const wi = this.get(id);
    if (!wi) throw new WorkflowError("NOT_FOUND", "unknown work item");
    const out = [];
    for (const t of this.tasks(id)) {
      const scope = this.projects.scope(t.projectId);
      if (!scope || !t.branch || !t.baseSha) continue;
      const d = await diffBetween(scope.root, t.baseSha, t.branch, (f) =>
        scope.secrets.matches(f),
      ).catch(() => ({
        files: [],
        withheld: [],
        patch: "",
      }));
      out.push({ taskId: t.id, projectId: t.projectId, branch: t.branch, ...d });
    }
    return { diffs: out };
  }

  // ---- commands -----------------------------------------------------------------------------
  create(title: string, description: string, projectId: string): WorkItem {
    if (!this.projects.scope(projectId)) throw new WorkflowError("NOT_FOUND", "unknown project");
    const seq = (
      this.store.db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM work_items").get() as {
        n: number;
      }
    ).n;
    const id = `WI-${String(seq).padStart(3, "0")}`;
    const now = new Date().toISOString();
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "INSERT INTO work_items (id, seq, title, description, project_id, stage, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'inbox', 'active', ?, ?)",
        )
        .run(id, seq, title, description, projectId, now, now);
      tx.emit(
        "workitem.changed",
        "po",
        { workItemId: id, title, stage: "inbox", status: "active" },
        { correlationId: id },
      );
    });
    void this.enter(id, "analysis");
    return this.get(id) as WorkItem;
  }

  action(id: string, action: "retry" | "cancel", note?: string): WorkItem {
    const wi = this.get(id);
    if (!wi) throw new WorkflowError("NOT_FOUND", "unknown work item");
    if (action === "cancel") {
      for (const r of this.agentRuns(id)) if (r.state === "running") this.executor.cancel(r.id);
      for (const a of this.approvals.list("pending"))
        if (a.subjectId === `wi:${id}`) this.approvals.expire(a.id);
      this.setStage(id, "cancelled", "cancelled", note ?? "cancelled by the PO");
      void this.cleanup(id);
      return this.get(id) as WorkItem;
    }
    if (wi.stage === "done" || wi.stage === "cancelled")
      throw new WorkflowError("VALIDATION_FAILED", "work item is closed");
    const rerun: Record<string, Stage> = {
      inbox: "analysis",
      analysis: "analysis",
      gate1: "analysis",
      design: "design",
      gate2: "design",
      build: "build",
      verify: "verify",
      gate4: "build",
    };
    for (const a of this.approvals.list("pending"))
      if (a.subjectId === `wi:${id}`) this.approvals.expire(a.id);
    void this.enter(id, rerun[wi.stage] ?? "analysis", note ?? null);
    return this.get(id) as WorkItem;
  }

  /** Restart recovery: interrupted agent runs fail; gate stages get a fresh approval request. */
  recover(): void {
    this.store.db
      .prepare(
        "UPDATE agent_runs SET state = 'failed', error = 'interrupted by a Harness restart', finished_at = ? WHERE state IN ('queued','running')",
      )
      .run(new Date().toISOString());
    for (const wi of this.list()) {
      if (wi.stage === "gate1" || wi.stage === "gate2" || wi.stage === "gate4")
        this.requestGate(wi.id, wi.stage);
      else if (
        ["analysis", "design", "build", "verify"].includes(wi.stage) &&
        wi.status === "active"
      ) {
        this.setStage(
          wi.id,
          wi.stage,
          "blocked",
          "interrupted by a Harness restart — press Retry to run this stage again",
        );
      }
    }
  }

  // ---- stage machine ------------------------------------------------------------------------
  private setStage(
    id: string,
    stage: Stage,
    status: WorkItemStatus,
    note: string | null = null,
  ): void {
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "UPDATE work_items SET stage = ?, status = ?, note = ?, updated_at = ? WHERE id = ?",
        )
        .run(stage, status, note, new Date().toISOString(), id);
      const wi = this.get(id) as WorkItem;
      tx.emit(
        "workitem.changed",
        "orchestrator",
        { workItemId: id, title: wi.title, stage, status },
        { correlationId: id },
      );
    });
  }

  private async enter(id: string, stage: Stage, note: string | null = null): Promise<void> {
    this.setStage(id, stage, "active", note);
    try {
      if (stage === "analysis") await this.runAnalysis(id);
      else if (stage === "design") await this.runDesign(id, note);
      else if (stage === "build") await this.runBuild(id, note);
      else if (stage === "verify") await this.runVerify(id);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      this.logger.error("stage failed", { workItemId: id, stage, error: msg });
      if (this.get(id)?.stage === stage) this.setStage(id, stage, "blocked", msg);
    }
  }

  private requestGate(id: string, gate: "gate1" | "gate2" | "gate4"): void {
    const wi = this.get(id) as WorkItem;
    const what = {
      gate1: [
        "Gate 1 · approve requirements",
        "The BA brief becomes final and the Architect starts the design.",
        ["Architect agent run (uses your Claude subscription)"],
      ],
      gate2: [
        "Gate 2 · approve design and tasks",
        "BE/FE agents will edit code on new local task branches.",
        ["Agent edits files in Harness worktrees only", "Branches are local; nothing is pushed"],
      ],
      gate4: [
        "Gate 4 · accept the change",
        "Marks the work item done. Task branches stay in the product repo for you to merge and push yourself.",
        ["Nothing is merged or pushed by the Harness"],
      ],
    } as const;
    const [title, detail, effects] = what[gate];
    this.setStage(id, gate, "waiting_po");
    const a = this.approvals.request({
      kind: "gate",
      title: `${wi.id} ${title}`,
      detail: `${wi.title}\n${detail}`,
      effects: [...effects],
      requestedBy: "orchestrator",
      subjectId: `wi:${id}`,
      payload: { id, gate, at: this.store.maxEventId() },
      correlationId: id,
    });
    this.approvals.onDecided(a.id, (d) => {
      const cur = this.get(id);
      if (!cur || cur.stage !== gate) return;
      if (d === "denied") {
        this.setStage(
          id,
          gate,
          "blocked",
          "changes requested by the PO — add a note and press Retry",
        );
        return;
      }
      if (gate === "gate1") void this.enter(id, "design");
      else if (gate === "gate2") void this.enter(id, "build");
      else {
        const branches = this.tasks(id)
          .map((t) => `${t.projectId}: ${t.branch ?? "—"}`)
          .join("; ");
        this.setStage(
          id,
          "done",
          "done",
          `Accepted. Local branches to merge/push yourself: ${branches}`,
        );
        void this.cleanup(id);
      }
    });
  }

  private async readOnlyWorktree(id: string, projectId: string): Promise<string> {
    const scope = this.projects.scope(projectId);
    const adapter = this.projects.adapter(projectId);
    if (!scope || !adapter) throw new Error(`unknown project ${projectId}`);
    const name = `${id.toLowerCase()}-ro`;
    const path = join(this.home, "worktrees", projectId, name);
    const { existsSync } = await import("node:fs");
    if (existsSync(path)) return path;
    await fetchOrigin(scope.root).catch(() => undefined);
    const sha = await resolveSha(scope.root, adapter.baseRef);
    await addWorktree(scope.root, join(this.home, "worktrees", projectId), name, sha);
    await stripSecrets(path, (f) => scope.secrets.matches(f));
    return path;
  }

  private artifact(
    id: string,
    kind: string,
    title: string,
    content: string,
    agentRunId: string | null,
  ): void {
    this.store.db
      .prepare(
        "INSERT INTO artifacts (work_item_id, kind, title, content, agent_run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, kind, title, content, agentRunId, new Date().toISOString());
  }

  private latest(id: string, kind: string): string {
    const r = this.store.db
      .prepare(
        "SELECT content FROM artifacts WHERE work_item_id = ? AND kind = ? ORDER BY id DESC LIMIT 1",
      )
      .get(id, kind) as { content: string } | undefined;
    return r?.content ?? "";
  }

  private async runAnalysis(id: string): Promise<void> {
    const wi = this.get(id) as WorkItem;
    const cwd = await this.readOnlyWorktree(id, wi.projectId);
    const res = await this.agent(
      id,
      null,
      "ba",
      "analysis",
      cwd,
      [{ path: cwd, projectId: wi.projectId }],
      null,
      READ_TOOLS,
      baPrompt(wi.title, wi.description, wi.projectId),
      30,
    );
    if (!res.ok || !res.output) throw new Error(`BA agent failed: ${res.error ?? "no output"}`);
    this.artifact(id, "brief", "Requirement brief (BA)", res.output, res.agentRunId);
    this.requestGate(id, "gate1");
  }

  private async runDesign(id: string, note: string | null): Promise<void> {
    const wi = this.get(id) as WorkItem;
    const cwd = await this.readOnlyWorktree(id, wi.projectId);
    const res = await this.agent(
      id,
      null,
      "architect",
      "design",
      cwd,
      [{ path: cwd, projectId: wi.projectId }],
      null,
      READ_TOOLS,
      architectPrompt(wi.title, this.latest(id, "brief"), wi.projectId, note),
      40,
    );
    if (!res.ok || !res.output)
      throw new Error(`Architect agent failed: ${res.error ?? "no output"}`);
    this.artifact(id, "design", "Design and tasks (Architect)", res.output, res.agentRunId);
    let tasks = parseTasks(res.output).filter((t) => this.projects.scope(t.projectId));
    if (!tasks.length) {
      tasks = [
        {
          owner: wi.projectId === "furwatch-app" ? "fe" : "be",
          projectId: wi.projectId,
          title: wi.title,
          details: "Implement the approved brief and design.",
        },
      ];
    }
    this.store.db
      .prepare("DELETE FROM tasks WHERE work_item_id = ? AND status = 'pending'")
      .run(id);
    const existing = this.tasks(id).length;
    tasks.forEach((t, i) => {
      this.store.db
        .prepare(
          "INSERT INTO tasks (id, work_item_id, owner, project_id, title, details, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        )
        .run(`${id}-T${existing + i + 1}`, id, t.owner, t.projectId, t.title, t.details);
    });
    this.requestGate(id, "gate2");
  }

  private async runBuild(id: string, note: string | null): Promise<void> {
    for (const t of this.tasks(id)) {
      if (t.status === "done" && !note) continue;
      const scope = this.projects.scope(t.projectId);
      const adapter = this.projects.adapter(t.projectId);
      if (!scope || !adapter) throw new Error(`unknown project ${t.projectId}`);
      this.store.db.prepare("UPDATE tasks SET status = 'running' WHERE id = ?").run(t.id);
      let base = t.baseSha;
      if (!base) {
        await fetchOrigin(scope.root).catch(() => undefined);
        base = await resolveSha(scope.root, adapter.baseRef);
      }
      const branch =
        t.branch ?? `${process.env.HARNESS_BRANCH_PREFIX ?? "fw/"}${t.id.toLowerCase()}`;
      const wt = await addBranchWorktree(
        scope.root,
        join(this.home, "worktrees", t.projectId),
        t.id.toLowerCase(),
        branch,
        t.commit ?? base,
      );
      await stripSecrets(wt, (f) => scope.secrets.matches(f));
      this.store.db
        .prepare("UPDATE tasks SET branch = ?, worktree = ?, base_sha = ? WHERE id = ?")
        .run(branch, wt, base, t.id);
      const role: "be" | "fe" = t.owner === "fe" ? "fe" : "be";
      const res = await this.agent(
        id,
        t.id,
        role,
        `implement ${t.id}`,
        wt,
        [{ path: wt, projectId: t.projectId }],
        wt,
        WRITE_TOOLS,
        implementPrompt(role, t, this.latest(id, "brief"), this.latest(id, "design"), note),
        60,
      );
      const sha = await commitAll(
        wt,
        `${t.id}: ${t.title}\n\nAgent: ${role} (Furwatch Harness)`,
      ).catch(() => null);
      if (res.output)
        this.artifact(
          id,
          `report-${t.id}`,
          `Implementation report ${t.id} (${role.toUpperCase()})`,
          res.output,
          res.agentRunId,
        );
      if (!res.ok) {
        this.store.db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(t.id);
        throw new Error(
          `${role.toUpperCase()} agent failed on ${t.id}: ${res.error ?? "unknown error"}`,
        );
      }
      const head = sha ?? t.commit;
      if (!head) {
        this.store.db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(t.id);
        throw new Error(`${t.id}: the agent made no code changes`);
      }
      this.store.db
        .prepare("UPDATE tasks SET status = 'done', commit_sha = ? WHERE id = ?")
        .run(head, t.id);
    }
    await this.enter(id, "verify");
  }

  private async runVerify(id: string): Promise<void> {
    const lines: string[] = [];
    let allPassed = true;
    for (const t of this.tasks(id)) {
      const adapter = this.projects.adapter(t.projectId);
      const wt = (
        this.store.db.prepare("SELECT worktree FROM tasks WHERE id = ?").get(t.id) as {
          worktree: string | null;
        }
      ).worktree;
      if (!adapter || !wt || !t.commit) continue;
      const order = ["install", "build", "lint", "test"].filter((c) => adapter.commands[c]);
      for (const commandId of order) {
        const cmd = adapter.commands[commandId];
        if (!cmd) continue;
        if (commandId === "install" && t.projectId === "furwatch-api") continue; // build restores itself
        if (cmd.approval === "ask") {
          const decision = await new Promise<"approved" | "denied">((res) => {
            const a = this.approvals.request({
              kind: "command",
              title: `${id} · run "${commandId}" for ${t.projectId} (verification)`,
              detail: `${cmd.argv.join(" ")}\nin task worktree ${t.branch} @ ${t.commit?.slice(0, 10)}`,
              effects: ["Downloads packages from the registry into the task worktree"],
              requestedBy: "tester",
              subjectId: `wi:${id}:verify`,
              payload: { id, task: t.id, commandId, commit: t.commit },
              correlationId: id,
            });
            this.approvals.onDecided(a.id, res);
          });
          if (decision === "denied") {
            lines.push(`- ${t.id} ${commandId}: skipped (denied by PO)`);
            allPassed = false;
            break;
          }
        }
        const run = this.runner.startInWorktree(t.projectId, commandId, wt, t.commit, id);
        const done = await this.runner.waitFor(run.id);
        lines.push(`- ${t.id} \`${commandId}\`: **${done.state}** — ${done.summary ?? ""}`);
        if (done.state !== "passed") {
          allPassed = false;
          if (commandId === "install" || commandId === "build") break;
        }
      }
    }
    this.artifact(
      id,
      "verification",
      "Verification (Tester)",
      `${allPassed ? "All checks passed." : "Some checks did not pass."}\n\n${lines.join("\n")}`,
      null,
    );
    this.requestGate(id, "gate4");
  }

  private async cleanup(id: string): Promise<void> {
    const wi = this.get(id);
    if (!wi) return;
    const scope = this.projects.scope(wi.projectId);
    if (scope)
      await removeWorktree(
        scope.root,
        join(this.home, "worktrees", wi.projectId, `${id.toLowerCase()}-ro`),
      ).catch((e: unknown) =>
        this.logger.warn("cleanup.failed", { workItemId: id, error: (e as Error).message }),
      );
    for (const t of this.tasks(id)) {
      const s = this.projects.scope(t.projectId);
      const wt = (
        this.store.db.prepare("SELECT worktree FROM tasks WHERE id = ?").get(t.id) as {
          worktree: string | null;
        }
      ).worktree;
      if (s && wt)
        await removeWorktree(s.root, wt).catch((e: unknown) =>
          this.logger.warn("cleanup.failed", { taskId: t.id, error: (e as Error).message }),
        ); // the branch stays
    }
  }

  // ---- agents -------------------------------------------------------------------------------
  private async slot(): Promise<() => void> {
    if (this.agentSlots < MAX_AGENTS) {
      this.agentSlots++;
    } else {
      await new Promise<void>((r) => this.agentQueue.push(r));
    }
    return () => {
      const next = this.agentQueue.shift();
      if (next) next();
      else this.agentSlots--;
    };
  }

  private async agent(
    workItemId: string,
    taskId: string | null,
    role: AgentRole,
    purpose: string,
    cwd: string,
    roots: { path: string; projectId: string | null }[],
    writeRoot: string | null,
    tools: string[],
    prompt: string,
    maxTurns: number,
  ) {
    const agentRunId = `${workItemId.toLowerCase()}-${role}-${Date.now().toString(36)}`;
    this.store.db
      .prepare(
        "INSERT INTO agent_runs (id, work_item_id, task_id, role, purpose, state, roots, write_root, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)",
      )
      .run(
        agentRunId,
        workItemId,
        taskId,
        role,
        purpose,
        JSON.stringify(roots),
        writeRoot,
        new Date().toISOString(),
      );
    this.executor.activity(agentRunId, workItemId, role, "info", `queued: ${purpose}`);
    const release = await this.slot();
    try {
      this.store.db.prepare("UPDATE agent_runs SET state = 'running' WHERE id = ?").run(agentRunId);
      this.executor.activity(agentRunId, workItemId, role, "info", `started: ${purpose}`);
      const res = await this.executor.run({
        agentRunId,
        workItemId,
        role,
        cwd,
        addDirs: [],
        prompt,
        systemPrompt: rolePrompt(this.harnessRoot, role),
        tools,
        maxTurns,
        timeoutMinutes: 45,
      });
      const cancelled =
        (
          this.store.db.prepare("SELECT state FROM agent_runs WHERE id = ?").get(agentRunId) as {
            state: string;
          }
        ).state === "cancelled";
      this.store.db
        .prepare(
          "UPDATE agent_runs SET state = ?, session_id = ?, turns = ?, cost_usd = ?, input_tokens = ?, output_tokens = ?, error = ?, output = ?, finished_at = ? WHERE id = ?",
        )
        .run(
          cancelled ? "cancelled" : res.ok ? "completed" : "failed",
          res.sessionId,
          res.turns,
          res.costUsd,
          res.inputTokens,
          res.outputTokens,
          res.error,
          res.output,
          new Date().toISOString(),
          agentRunId,
        );
      this.executor.activity(
        agentRunId,
        workItemId,
        role,
        res.ok ? "result" : "error",
        res.ok ? `finished in ${res.turns ?? "?"} turns` : `failed: ${res.error ?? ""}`,
      );
      return { ...res, ok: res.ok && !cancelled, agentRunId };
    } finally {
      release();
    }
  }

  cancelAgent(agentRunId: string): AgentRun {
    const r = this.store.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(agentRunId) as
      | Record<string, unknown>
      | undefined;
    if (!r) throw new WorkflowError("NOT_FOUND", "unknown agent run");
    if (r.state === "running" || r.state === "queued") {
      this.store.db
        .prepare("UPDATE agent_runs SET state = 'cancelled' WHERE id = ?")
        .run(agentRunId);
      this.executor.cancel(agentRunId);
    }
    return this.agentRunDetail(agentRunId).agentRun;
  }
}

function toAgentRun(r: Record<string, unknown>): AgentRun {
  const num = (v: unknown) =>
    typeof v === "number" ? v : v === null || v === undefined ? null : Number(v);
  return {
    id: String(r.id),
    workItemId: String(r.work_item_id),
    taskId: (r.task_id as string | null) ?? null,
    role: r.role as AgentRole,
    purpose: String(r.purpose),
    state: r.state as AgentRun["state"],
    sessionId: (r.session_id as string | null) ?? null,
    turns: num(r.turns),
    costUsd: num(r.cost_usd),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    error: (r.error as string | null) ?? null,
    createdAt: String(r.created_at),
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}
