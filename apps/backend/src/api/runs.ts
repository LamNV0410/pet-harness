// M2 routes: commands, runs, live logs, approvals.
import {
  ApprovalsQuery,
  contracts,
  DecideRequest,
  RunsQuery,
  StartRunRequest,
} from "@harness/shared";
import type { ApprovalService } from "../approvals/index.js";
import { RunError, type Runner } from "../runtime/runner.js";
import type { RouteKit } from "./index.js";

export function runRoutes(runner: Runner, approvals: ApprovalService) {
  return ({ route, fail }: RouteKit) => {
    const id = (req: { params: unknown }) => (req.params as { id: string }).id;
    const guard = <T>(reply: Parameters<typeof fail>[0], fn: () => T) => {
      try {
        return fn();
      } catch (e) {
        if (e instanceof RunError) return fail(reply, e.code, e.message);
        throw e;
      }
    };

    route(contracts.listCommands, async (req, reply) =>
      guard(reply, () => ({ commands: runner.commands(id(req)) })),
    );

    route(contracts.startRun, async (req, reply) => {
      const body = StartRunRequest.safeParse(req.body ?? {});
      if (!body.success)
        return fail(reply, "VALIDATION_FAILED", "Invalid request body", body.error.issues);
      return guard(reply, () => ({ run: runner.start(id(req), body.data) }));
    });

    route(contracts.listRuns, async (req, reply) => {
      const q = RunsQuery.safeParse(req.query);
      if (!q.success) return fail(reply, "VALIDATION_FAILED", "Invalid query", q.error.issues);
      return { runs: runner.list(q.data.projectId, q.data.limit ?? 50) };
    });

    route(contracts.getRun, async (req, reply) => {
      const run = runner.get(id(req));
      return run ? { run } : fail(reply, "NOT_FOUND", "unknown run");
    });

    route(contracts.runLog, async (req, reply) => {
      if (!runner.get(id(req))) return fail(reply, "NOT_FOUND", "unknown run");
      return { lines: runner.readLog(id(req)), done: runner.isDone(id(req)) };
    });

    route(contracts.runLogStream, async (req, reply) => {
      const runId = id(req);
      if (!runner.get(runId)) return fail(reply, "NOT_FOUND", "unknown run");
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const send = (event: string, data: string) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      for (const l of runner.readLog(runId)) send("line", l);
      if (runner.isDone(runId)) {
        send("end", "");
        res.end();
        return;
      }
      const unsub = runner.subscribeLog(runId, (line) => {
        if (line === null) {
          send("end", "");
          res.end();
        } else send("line", line);
      });
      const hb = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
      res.on("close", () => {
        clearInterval(hb);
        unsub();
      });
    });

    route(contracts.cancelRun, async (req, reply) =>
      guard(reply, () => ({ run: runner.cancel(id(req)) })),
    );

    route(contracts.listApprovals, async (req, reply) => {
      const q = ApprovalsQuery.safeParse(req.query);
      if (!q.success) return fail(reply, "VALIDATION_FAILED", "Invalid query", q.error.issues);
      return { approvals: approvals.list(q.data.state) };
    });

    route(contracts.decideApproval, async (req, reply) => {
      const body = DecideRequest.safeParse(req.body ?? {});
      if (!body.success)
        return fail(reply, "VALIDATION_FAILED", "Invalid request body", body.error.issues);
      const a = approvals.decide(id(req), body.data.decision);
      return a ? { approval: a } : fail(reply, "NOT_FOUND", "unknown approval");
    });
  };
}
