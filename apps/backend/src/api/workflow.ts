// M3–M6 routes: work items, agent runs, the Claude Code hook, dashboard, product servers.
import {
  CreateWorkItemRequest,
  workflowContracts as c,
  WorkItemActionRequest,
} from "@harness/shared";
import { claudeBin } from "../agents/executor.js";
import type { AgentHook } from "../agents/hook.js";
import type { ApprovalService } from "../approvals/index.js";
import type { Runner } from "../runtime/runner.js";
import { ServerError, type ServerManager } from "../runtime/servers.js";
import type { Store } from "../store/index.js";
import { type Workflow, WorkflowError } from "../workflow/engine.js";
import type { RouteKit } from "./index.js";

export function workflowRoutes(deps: {
  workflow: Workflow;
  hook: AgentHook;
  approvals: ApprovalService;
  runner: Runner;
  servers: ServerManager;
  store: Store;
}) {
  const { workflow, hook, approvals, runner, servers, store } = deps;
  return ({ route, fail }: RouteKit) => {
    const id = (req: { params: unknown }) => (req.params as { id: string }).id;
    const guard = async <T>(reply: Parameters<typeof fail>[0], fn: () => T | Promise<T>) => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof WorkflowError || e instanceof ServerError)
          return fail(reply, e.code, e.message);
        throw e;
      }
    };

    route(c.listWorkItems, async () => ({ workItems: workflow.list() }));
    route(c.createWorkItem, async (req, reply) => {
      const b = CreateWorkItemRequest.safeParse(req.body ?? {});
      if (!b.success)
        return fail(reply, "VALIDATION_FAILED", "Invalid request body", b.error.issues);
      return guard(reply, () => ({
        workItem: workflow.create(b.data.title, b.data.description, b.data.projectId),
      }));
    });
    route(c.getWorkItem, async (req, reply) => guard(reply, () => workflow.detail(id(req))));
    route(c.workItemAction, async (req, reply) => {
      const b = WorkItemActionRequest.safeParse(req.body ?? {});
      if (!b.success)
        return fail(reply, "VALIDATION_FAILED", "Invalid request body", b.error.issues);
      return guard(reply, () => ({
        workItem: workflow.action(id(req), b.data.action, b.data.note),
      }));
    });
    route(c.workItemDiff, async (req, reply) => guard(reply, () => workflow.diff(id(req))));
    route(c.listAgentRuns, async () => ({ agentRuns: workflow.agentRuns(undefined, 100) }));
    route(c.getAgentRun, async (req, reply) =>
      guard(reply, () => workflow.agentRunDetail(id(req))),
    );
    route(c.cancelAgentRun, async (req, reply) =>
      guard(reply, () => ({ agentRun: workflow.cancelAgent(id(req)) })),
    );

    // Claude Code PreToolUse HTTP hook. Answers in the hook output schema.
    route(c.preToolUseHook, async (req) => {
      const runId = String((req.query as { run?: string }).run ?? "");
      const v = hook.decide(runId, (req.body ?? {}) as Record<string, unknown>);
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: v.decision,
          permissionDecisionReason: `${v.reason} (${v.ruleId})`,
        },
      };
    });

    route(c.dashboard, async () => {
      const count = (sql: string, ...p: (string | number)[]) =>
        Number((store.db.prepare(sql).get(...p) as { n: number }).n);
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const usage = store.db
        .prepare(
          "SELECT COALESCE(SUM(cost_usd),0) c, COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o, COUNT(*) n FROM agent_runs",
        )
        .get() as { c: number; i: number; o: number; n: number };
      const byStage: Record<string, number> = {};
      for (const w of workflow.list()) byStage[w.stage] = (byStage[w.stage] ?? 0) + 1;
      return {
        agents: {
          cli: claudeBin(),
          running: count("SELECT COUNT(*) n FROM agent_runs WHERE state = 'running'"),
          queued: count("SELECT COUNT(*) n FROM agent_runs WHERE state = 'queued'"),
        },
        workItems: byStage,
        pendingApprovals: approvals.list("pending").length,
        runs: {
          running: count(
            "SELECT COUNT(*) n FROM command_runs WHERE state IN ('queued','preparing','running','waiting_approval')",
          ),
          passed24h: count(
            "SELECT COUNT(*) n FROM command_runs WHERE state = 'passed' AND created_at > ?",
            since,
          ),
          failed24h: count(
            "SELECT COUNT(*) n FROM command_runs WHERE state IN ('failed','error','timed_out') AND created_at > ?",
            since,
          ),
        },
        usage: {
          costUsd: Number(usage.c),
          inputTokens: Number(usage.i),
          outputTokens: Number(usage.o),
          agentRuns: Number(usage.n),
        },
        servers: servers.list(),
      };
    });

    route(c.listServers, async () => ({ servers: servers.list() }));
    route(c.startServer, async (req, reply) =>
      guard(reply, () => ({ server: servers.start(id(req)) })),
    );
    route(c.stopServer, async (req, reply) =>
      guard(reply, async () => ({ server: await servers.stop(id(req)) })),
    );
    void runner;
  };
}
