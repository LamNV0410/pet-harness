// PreToolUse decisions for agent runs (TD-05 + TD-12). Claude Code posts every tool call here.
// Reads must stay inside the run's roots; writes only for BE/FE inside their task worktree;
// secret and generated paths are denied; every other tool (shell, web, subagents) is denied.
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { GlobSet } from "../permissions/glob.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Store } from "../store/index.js";
import type { AgentExecutor } from "./executor.js";

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

interface RunRow {
  id: string;
  work_item_id: string;
  role: string;
  roots: string;
  write_root: string | null;
  state: string;
}

export interface HookDecision {
  decision: "allow" | "deny";
  reason: string;
  ruleId: string;
}

export class AgentHook {
  constructor(
    private readonly store: Store,
    private readonly projects: ProjectRegistry,
    private readonly executor: AgentExecutor,
  ) {}

  decide(runId: string, body: Record<string, unknown>): HookDecision {
    const tool = String(body.tool_name ?? "");
    const input = (body.tool_input ?? {}) as Record<string, unknown>;
    const run = this.store.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId) as
      | RunRow
      | undefined;
    const verdict = this.evaluate(run, tool, input, String(body.cwd ?? ""));
    if (run) {
      const toolCallId = randomUUID();
      const target = String(
        input.file_path ??
          input.path ??
          input.pattern ??
          input.notebook_path ??
          input.command ??
          "",
      );
      this.store.transaction((tx) => {
        tx.emit(
          "tool.requested",
          run.role,
          {
            toolCallId,
            tool: `claude.${tool}`,
            role: run.role,
            projectId: run.work_item_id,
            input: { target },
          },
          { correlationId: run.work_item_id },
        );
        tx.emit(
          "tool.decided",
          "permissions",
          {
            toolCallId,
            tool: `claude.${tool}`,
            decision: verdict.decision,
            ruleId: verdict.ruleId,
            reason: verdict.reason,
          },
          { correlationId: run.work_item_id },
        );
      });
      if (verdict.decision === "deny") {
        this.executor.activity(
          run.id,
          run.work_item_id,
          run.role,
          "denied",
          `${tool} ${target} → ${verdict.reason}`,
        );
      }
    }
    return verdict;
  }

  private evaluate(
    run: RunRow | undefined,
    tool: string,
    input: Record<string, unknown>,
    cwd: string,
  ): HookDecision {
    if (!run) return deny("fixed:unknown-run", "this agent run is not known to the Harness");
    if (run.state !== "running")
      return deny("fixed:run-not-running", "this agent run is not running");
    const isWrite = WRITE_TOOLS.has(tool);
    if (!READ_TOOLS.has(tool) && !isWrite)
      return deny("fixed:tool-not-allowed", `tool ${tool} is not available to agents`);

    const roots = JSON.parse(run.roots) as { path: string; projectId: string | null }[];
    const raw = String(
      input.file_path ?? input.notebook_path ?? input.path ?? (cwd || roots[0]?.path) ?? "",
    );
    if (!raw) return deny("fixed:path-invalid", "missing path");
    const abs = isAbsolute(raw) ? resolve(raw) : resolve(cwd || roots[0]?.path || ".", raw);
    if (/[\\/]\.git([\\/]|$)/i.test(abs))
      return deny("fixed:git-internal", "the .git folder is off limits");

    const root = roots.find((r) => inside(r.path, abs));
    if (!root) return deny("fixed:path-escape", "path is outside the folders this agent may use");
    const rel = relative(root.path, abs).split("\\").join("/") || ".";
    if (root.projectId) {
      const scope = this.projects.scope(root.projectId);
      if (scope?.secrets.matches(rel)) return deny("fixed:secret-path", `${rel} is a secret path`);
    }

    if (isWrite) {
      if (run.role !== "be" && run.role !== "fe")
        return deny("fixed:read-only-role", `${run.role} agents cannot edit files`);
      if (!run.write_root || !inside(run.write_root, abs))
        return deny(
          "fixed:write-outside-worktree",
          "edits are allowed only inside the task worktree",
        );
      const gen = root.projectId ? (this.projects.adapter(root.projectId)?.generated ?? []) : [];
      if (new GlobSet(gen).matches(rel))
        return deny("fixed:generated-path", `${rel} is generated output`);
      return {
        decision: "allow",
        ruleId: "policy:agent-write-own-worktree",
        reason: "edit inside own task worktree",
      };
    }
    return {
      decision: "allow",
      ruleId: "policy:agent-read-roots",
      reason: "read inside allowed folders",
    };
  }
}

function inside(root: string, target: string): boolean {
  const r = relative(resolve(root).toLowerCase(), resolve(target).toLowerCase());
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

function deny(ruleId: string, reason: string): HookDecision {
  return { decision: "deny", ruleId, reason };
}
