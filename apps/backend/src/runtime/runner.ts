// Verification runner (M2): declared adapter commands only, in a fresh worktree at the base ref's SHA,
// with live redacted logs, approvals for `approval: ask`, a verdict cache per (project, sha, command),
// a small queue (1 per project, 2 total), cancel/timeout with process-tree kill.
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type CommandInfo,
  type CommandRun,
  FINAL_RUN_STATES,
  type RunState,
  type StartRunRequest,
} from "@harness/shared";
import type { ApprovalService } from "../approvals/index.js";
import type { Logger } from "../logger.js";
import { redactText } from "../permissions/redactor.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Store } from "../store/index.js";
import { resolveArgv, runProcess, type Spawned, type Toolchains } from "./process.js";
import { summarize } from "./summary.js";
import { addWorktree, fetchOrigin, removeWorktree, resolveSha } from "./worktrees.js";

const MAX_PARALLEL = 2;
const KEEP_LOGS_PER_PROJECT = 20;

interface Row {
  id: string;
  project_id: string;
  command_id: string;
  argv: string;
  base_ref: string;
  sha: string | null;
  state: string;
  exit_code: number | null;
  summary: string | null;
  duration_ms: number | null;
  fetch: number;
  keep_worktree: number;
  worktree: string | null;
  approval_id: string | null;
  cached_from: string | null;
  created_at: string;
  finished_at: string | null;
}

const toRun = (r: Row): CommandRun => ({
  id: r.id,
  projectId: r.project_id,
  commandId: r.command_id,
  argv: JSON.parse(r.argv) as string[],
  baseRef: r.base_ref,
  sha: r.sha,
  state: r.state as RunState,
  exitCode: r.exit_code,
  summary: r.summary,
  durationMs: r.duration_ms,
  fetch: r.fetch === 1,
  keepWorktree: r.keep_worktree === 1,
  worktree: r.worktree,
  approvalId: r.approval_id,
  cachedFrom: r.cached_from,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export class RunError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "VALIDATION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export class Runner {
  private readonly queue: { runId: string; rerun: boolean }[] = [];
  private readonly preset = new Map<string, { path: string; sha: string }>();
  private readonly waiters = new Map<string, ((r: CommandRun) => void)[]>();
  private readonly active = new Map<
    string,
    { projectId: string; proc: Spawned | null; cancelled: boolean }
  >();
  private readonly logSubs = new Map<string, Set<(line: string | null) => void>>();
  private readonly logsDir: string;
  private readonly worktreesDir: string;

  constructor(
    private readonly store: Store,
    private readonly projects: ProjectRegistry,
    private readonly approvals: ApprovalService,
    private readonly logger: Logger,
    private readonly toolchains: Toolchains,
    home: string,
  ) {
    this.logsDir = join(home, "runs");
    this.worktreesDir = join(home, "worktrees");
    mkdirSync(this.logsDir, { recursive: true });
  }

  /** Runs left unfinished by a crash/restart end as "error" (TD-08: nothing resumes silently). */
  recover(): void {
    const open = this.store.db
      .prepare(
        `SELECT * FROM command_runs WHERE state NOT IN (${FINAL_RUN_STATES.map(() => "?").join(",")})`,
      )
      .all(...FINAL_RUN_STATES) as unknown as Row[];
    for (const r of open)
      this.finish(r.id, "error", null, "interrupted by a Harness restart", null);
  }

  commands(projectId: string): CommandInfo[] {
    const adapter = this.projects.adapter(projectId);
    if (!adapter) throw new RunError("NOT_FOUND", "unknown project");
    return Object.entries(adapter.commands).map(([id, c]) => ({
      id,
      argv: c.argv,
      approval: c.approval,
      kind: id === "run" ? "server" : "verify",
    }));
  }

  start(projectId: string, req: StartRunRequest, requestedBy = "po"): CommandRun {
    const adapter = this.projects.adapter(projectId);
    const scope = this.projects.scope(projectId);
    if (!adapter || !scope) throw new RunError("NOT_FOUND", "unknown project");
    if (!scope.available) throw new RunError("VALIDATION_FAILED", "project path is unavailable");
    const cmd = adapter.commands[req.commandId];
    if (!cmd)
      throw new RunError(
        "VALIDATION_FAILED",
        `command "${req.commandId}" is not declared in the adapter`,
      );
    if (req.commandId === "run")
      throw new RunError(
        "VALIDATION_FAILED",
        'server commands ("run") are started from the Runtime view (M6)',
      );

    const id = randomUUID();
    const now = new Date().toISOString();
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          `INSERT INTO command_runs (id, project_id, command_id, argv, base_ref, state, fetch, keep_worktree, created_at)
           VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          req.commandId,
          JSON.stringify(cmd.argv),
          adapter.baseRef,
          req.fetch ? 1 : 0,
          req.keepWorktree ? 1 : 0,
          now,
        );
      tx.emit(
        "run.state_changed",
        requestedBy,
        {
          runId: id,
          projectId,
          commandId: req.commandId,
          state: "queued",
          sha: null,
          exitCode: null,
          summary: null,
        },
        { correlationId: `run:${id}` },
      );
    });

    if (cmd.approval === "ask") {
      const approval = this.approvals.request({
        kind: "command",
        title: `Run "${req.commandId}" for ${projectId}`,
        detail: `${cmd.argv.join(" ")}\nbase ${adapter.baseRef}${req.fetch ? " (after git fetch)" : ""} · fresh worktree`,
        effects: effectsOf(req.commandId),
        requestedBy,
        subjectId: `run:${id}`,
        payload: { projectId, commandId: req.commandId, argv: cmd.argv, baseRef: adapter.baseRef },
      });
      this.setState(id, "waiting_approval", { approval_id: approval.id });
      this.approvals.onDecided(approval.id, (d) => {
        if (d === "approved") this.enqueue(id, req.rerun);
        else this.finish(id, "denied", null, "denied by the PO", null);
      });
    } else {
      this.enqueue(id, req.rerun);
    }
    return this.get(id) as CommandRun;
  }

  /** M4: run a declared command inside an existing task worktree (no fetch, no cache, kept). */
  startInWorktree(
    projectId: string,
    commandId: string,
    worktree: string,
    sha: string,
    workItemId: string,
  ): CommandRun {
    const adapter = this.projects.adapter(projectId);
    const cmd = adapter?.commands[commandId];
    if (!adapter || !cmd)
      throw new RunError("VALIDATION_FAILED", `command "${commandId}" is not declared`);
    const id = randomUUID();
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          `INSERT INTO command_runs (id, project_id, command_id, argv, base_ref, sha, state, fetch, keep_worktree, worktree, work_item_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, 1, ?, ?, ?)`,
        )
        .run(
          id,
          projectId,
          commandId,
          JSON.stringify(cmd.argv),
          adapter.baseRef,
          sha,
          worktree,
          workItemId,
          new Date().toISOString(),
        );
      tx.emit(
        "run.state_changed",
        "tester",
        { runId: id, projectId, commandId, state: "queued", sha, exitCode: null, summary: null },
        { correlationId: workItemId },
      );
    });
    this.preset.set(id, { path: worktree, sha });
    this.enqueue(id, true);
    return this.get(id) as CommandRun;
  }

  waitFor(id: string): Promise<CommandRun> {
    const r = this.get(id);
    if (r && FINAL_RUN_STATES.includes(r.state)) return Promise.resolve(r);
    return new Promise((res) => this.waiters.set(id, [...(this.waiters.get(id) ?? []), res]));
  }

  listForWorkItem(workItemId: string): CommandRun[] {
    return (
      this.store.db
        .prepare("SELECT * FROM command_runs WHERE work_item_id = ? ORDER BY created_at")
        .all(workItemId) as unknown as Row[]
    ).map(toRun);
  }

  cancel(id: string): CommandRun {
    const run = this.get(id);
    if (!run) throw new RunError("NOT_FOUND", "unknown run");
    if (FINAL_RUN_STATES.includes(run.state)) return run;
    const act = this.active.get(id);
    if (act) {
      act.cancelled = true;
      act.proc?.cancel();
    } else {
      const qi = this.queue.findIndex((q) => q.runId === id);
      if (qi >= 0) this.queue.splice(qi, 1);
      if (run.approvalId) this.approvals.expire(run.approvalId);
      this.finish(id, "cancelled", null, "cancelled by the PO", null);
    }
    return this.get(id) as CommandRun;
  }

  get(id: string): CommandRun | null {
    const r = this.store.db.prepare("SELECT * FROM command_runs WHERE id = ?").get(id) as
      | Row
      | undefined;
    return r ? toRun(r) : null;
  }

  list(projectId?: string, limit = 50): CommandRun[] {
    const rows = (projectId
      ? this.store.db
          .prepare(
            "SELECT * FROM command_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
          )
          .all(projectId, limit)
      : this.store.db
          .prepare("SELECT * FROM command_runs ORDER BY created_at DESC LIMIT ?")
          .all(limit)) as unknown as Row[];
    return rows.map(toRun);
  }

  latestVerdicts(projectId: string): CommandRun[] {
    const rows = this.store.db
      .prepare(
        `SELECT r.* FROM command_runs r JOIN (SELECT command_id, MAX(created_at) m FROM command_runs
         WHERE project_id = ? AND state IN ('passed','failed','cached') GROUP BY command_id) x
         ON r.command_id = x.command_id AND r.created_at = x.m WHERE r.project_id = ?`,
      )
      .all(projectId, projectId) as unknown as Row[];
    return rows.map(toRun);
  }

  readLog(id: string): string[] {
    const f = join(this.logsDir, `${id}.log`);
    return existsSync(f)
      ? readFileSync(f, "utf8")
          .split("\n")
          .filter((l, i, a) => l !== "" || i < a.length - 1)
      : [];
  }

  subscribeLog(id: string, cb: (line: string | null) => void): () => void {
    const set = this.logSubs.get(id) ?? new Set();
    set.add(cb);
    this.logSubs.set(id, set);
    return () => set.delete(cb);
  }

  isDone(id: string): boolean {
    const r = this.get(id);
    return !r || FINAL_RUN_STATES.includes(r.state);
  }

  // ------------------------------------------------------------------------------------------
  private enqueue(runId: string, rerun: boolean): void {
    this.queue.push({ runId, rerun });
    this.pump();
  }

  private pump(): void {
    while (this.active.size < MAX_PARALLEL) {
      const busy = new Set([...this.active.values()].map((a) => a.projectId));
      const idx = this.queue.findIndex((q) => !busy.has(this.get(q.runId)?.projectId ?? ""));
      if (idx < 0) return;
      const [next] = this.queue.splice(idx, 1);
      if (!next) return;
      const run = this.get(next.runId);
      if (!run) continue;
      this.active.set(run.id, { projectId: run.projectId, proc: null, cancelled: false });
      void this.execute(run, next.rerun).finally(() => {
        this.active.delete(run.id);
        this.pump();
      });
    }
  }

  private async execute(run: CommandRun, rerun: boolean): Promise<void> {
    const adapter = this.projects.adapter(run.projectId);
    const scope = this.projects.scope(run.projectId);
    const cmd = adapter?.commands[run.commandId];
    if (!adapter || !scope || !cmd)
      return this.finish(run.id, "error", null, "project or command disappeared", null);
    const t0 = Date.now();
    let worktree: string | null = null;
    let ownWorktree = false;
    this.setState(run.id, "preparing");
    try {
      const pre = this.preset.get(run.id);
      if (pre) {
        worktree = pre.path;
        this.setState(run.id, "preparing", { sha: pre.sha });
        this.log(run.id, `[harness] using task worktree at ${pre.sha.slice(0, 10)}`);
      } else {
        if (run.fetch) {
          this.log(run.id, `[harness] git fetch origin (${run.projectId})`);
          await fetchOrigin(scope.root).catch((e: Error) =>
            this.log(run.id, `[harness] fetch failed, using local refs: ${e.message}`),
          );
        }
        const sha = await resolveSha(scope.root, adapter.baseRef);
        this.setState(run.id, "preparing", { sha });
        this.log(run.id, `[harness] ${adapter.baseRef} = ${sha}`);

        if (!rerun) {
          const v = this.store.db
            .prepare(
              "SELECT run_id, state, summary FROM verdicts WHERE project_id = ? AND sha = ? AND command_id = ?",
            )
            .get(run.projectId, sha, run.commandId) as
            | { run_id: string; state: string; summary: string | null }
            | undefined;
          if (v) {
            this.log(
              run.id,
              `[harness] verdict already stored for this commit (${v.state}); not re-running`,
            );
            this.store.db
              .prepare("UPDATE command_runs SET cached_from = ? WHERE id = ?")
              .run(v.run_id, run.id);
            return this.finish(
              run.id,
              "cached",
              null,
              `${v.state}: ${v.summary ?? ""}`.trim(),
              Date.now() - t0,
            );
          }
        }
        if (this.active.get(run.id)?.cancelled)
          return this.finish(run.id, "cancelled", null, "cancelled", Date.now() - t0);

        this.log(run.id, `[harness] creating worktree at ${sha.slice(0, 10)}`);
        worktree = await addWorktree(
          scope.root,
          join(this.worktreesDir, run.projectId),
          run.id.slice(0, 8),
          sha,
        );
        this.store.db
          .prepare("UPDATE command_runs SET worktree = ? WHERE id = ?")
          .run(worktree, run.id);
        ownWorktree = true;
      }
      const sha = (this.get(run.id)?.sha ?? "") as string;
      if (!worktree) throw new Error("no worktree");

      const resolved = resolveArgv(cmd.argv, cmd.toolchain, this.toolchains);
      this.setState(run.id, "running");
      this.log(run.id, `[harness] $ ${cmd.argv.join(" ")}`);
      const lines: string[] = [];
      const proc = runProcess({
        file: resolved.file,
        args: resolved.args,
        cwd: worktree,
        env: cmd.env,
        pathPrefix: resolved.pathPrefix,
        timeoutMs: cmd.timeoutMinutes * 60_000,
        onLine: (l) => {
          const safe = redactText(l);
          lines.push(safe);
          if (lines.length > 4000) lines.shift();
          this.log(run.id, safe);
        },
      });
      const act = this.active.get(run.id);
      if (act) act.proc = proc;
      const res = await proc.done;
      const summary = summarize(run.commandId, lines, res.exitCode);
      const state: RunState = res.cancelled
        ? "cancelled"
        : res.timedOut
          ? "timed_out"
          : res.exitCode === 0
            ? "passed"
            : "failed";
      this.log(run.id, `[harness] exit ${res.exitCode ?? "?"} · ${state} · ${summary}`);
      this.finish(run.id, state, res.exitCode, summary, Date.now() - t0, sha);
    } catch (err) {
      const msg = redactText((err as Error).message);
      this.log(run.id, `[harness] error: ${msg}`);
      this.finish(run.id, "error", null, msg.slice(0, 300), Date.now() - t0);
    } finally {
      this.preset.delete(run.id);
      if (worktree && ownWorktree && !run.keepWorktree) {
        await removeWorktree(scope.root, worktree).catch((e: Error) =>
          this.logger.warn("worktree cleanup failed", { error: e.message }),
        );
      }
      this.pruneLogs(run.projectId);
    }
  }

  private log(runId: string, line: string): void {
    appendFileSync(join(this.logsDir, `${runId}.log`), `${line}\n`);
    for (const cb of this.logSubs.get(runId) ?? []) cb(line);
  }

  private setState(
    id: string,
    state: RunState,
    extra: Partial<Record<"sha" | "approval_id", string>> = {},
  ): void {
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "UPDATE command_runs SET state = ?, sha = COALESCE(?, sha), approval_id = COALESCE(?, approval_id) WHERE id = ?",
        )
        .run(state, extra.sha ?? null, extra.approval_id ?? null, id);
      const r = this.get(id) as CommandRun;
      tx.emit(
        "run.state_changed",
        "runner",
        {
          runId: id,
          projectId: r.projectId,
          commandId: r.commandId,
          state,
          sha: r.sha,
          exitCode: null,
          summary: null,
        },
        { correlationId: `run:${id}` },
      );
    });
  }

  private finish(
    id: string,
    state: RunState,
    exitCode: number | null,
    summary: string | null,
    durationMs: number | null,
    sha?: string,
  ): void {
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "UPDATE command_runs SET state = ?, exit_code = ?, summary = ?, duration_ms = ?, finished_at = ? WHERE id = ?",
        )
        .run(state, exitCode, summary, durationMs, new Date().toISOString(), id);
      const r = this.get(id) as CommandRun;
      if ((state === "passed" || state === "failed") && sha) {
        tx.db
          .prepare(
            `INSERT INTO verdicts (project_id, sha, command_id, run_id, state, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(project_id, sha, command_id) DO UPDATE SET run_id=excluded.run_id, state=excluded.state, summary=excluded.summary, created_at=excluded.created_at`,
          )
          .run(r.projectId, sha, r.commandId, id, state, summary, new Date().toISOString());
      }
      tx.emit(
        "run.state_changed",
        "runner",
        {
          runId: id,
          projectId: r.projectId,
          commandId: r.commandId,
          state,
          sha: r.sha,
          exitCode,
          summary,
        },
        { correlationId: `run:${id}` },
      );
    });
    for (const cb of this.logSubs.get(id) ?? []) cb(null);
    const done = this.get(id);
    if (done) for (const w of this.waiters.get(id) ?? []) w(done);
    this.waiters.delete(id);
    this.logSubs.delete(id);
    this.logger.info("run.finished", { runId: id, state, exitCode, durationMs });
  }

  private pruneLogs(projectId: string): void {
    const keep = new Set(this.list(projectId, KEEP_LOGS_PER_PROJECT).map((r) => r.id));
    const all = this.store.db
      .prepare("SELECT id FROM command_runs WHERE project_id = ?")
      .all(projectId) as { id: string }[];
    for (const { id } of all) {
      const f = join(this.logsDir, `${id}.log`);
      if (!keep.has(id) && existsSync(f) && statSync(f).isFile()) rmSync(f, { force: true });
    }
  }
}

function effectsOf(commandId: string): string[] {
  if (commandId === "install") {
    return [
      "Downloads packages from the npm registry (no lockfile: versions may differ)",
      "Writes node_modules inside the Harness worktree only",
    ];
  }
  return ["Runs in a fresh worktree under .harness/worktrees"];
}
