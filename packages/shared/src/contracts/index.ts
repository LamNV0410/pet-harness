// HTTP contracts for M1 (design.md §4). The backend registers every route from these objects,
// and the frontend client is typed by them (OQ-15), so the two apps cannot drift apart.
import { z } from "zod";
import { Approval, ApprovalState, CommandInfo, CommandRun, Project } from "../domain/index.js";
import type { ErrorCode } from "../errors/index.js";
import { HarnessEvent } from "../events/index.js";

export interface ContractDef {
  readonly id: string;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly summary: string;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly response: z.ZodType;
  readonly errors: readonly ErrorCode[];
  /** Server-Sent Events stream; `response` describes one event. */
  readonly stream?: boolean;
}

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  db: z.enum(["ok", "error"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ProjectsResponse = z.object({ projects: z.array(Project) });
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;

export const ReloadResponse = z.object({
  projects: z.array(Project),
  rejected: z.array(z.object({ file: z.string(), errors: z.array(z.string()) })),
});
export type ReloadResponse = z.infer<typeof ReloadResponse>;

const nonNegativeInt = z.coerce.number().int().min(0);
export const EventsQuery = z.object({
  since: nonNegativeInt.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export const EventsResponse = z.object({ events: z.array(HarnessEvent) });
export type EventsResponse = z.infer<typeof EventsResponse>;

export const EventStreamQuery = z.object({
  since: nonNegativeInt.optional(),
  token: z.string().optional(),
});

export const ToolInvokeRequest = z.object({
  /** Validated by the permission engine, not the schema (OQ-13): unknown roles become deny events. */
  role: z.string().min(1),
  projectId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type ToolInvokeRequest = z.infer<typeof ToolInvokeRequest>;

export const ToolInvokeResponse = z.object({
  toolCallId: z.string(),
  decision: z.literal("allow"),
  ruleId: z.string(),
  filtered: z.boolean(),
  result: z.unknown(),
});
export type ToolInvokeResponse = z.infer<typeof ToolInvokeResponse>;

export const CommandsResponse = z.object({ commands: z.array(CommandInfo) });
export const StartRunRequest = z.object({
  commandId: z.string().min(1),
  fetch: z.boolean().default(true),
  keepWorktree: z.boolean().default(false),
  rerun: z.boolean().default(false),
});
export type StartRunRequest = z.infer<typeof StartRunRequest>;
export const RunResponse = z.object({ run: CommandRun });
export const RunsQuery = z.object({
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const RunsResponse = z.object({ runs: z.array(CommandRun) });
export const RunLogResponse = z.object({ lines: z.array(z.string()), done: z.boolean() });
export const ApprovalsQuery = z.object({ state: ApprovalState.optional() });
export const ApprovalsResponse = z.object({ approvals: z.array(Approval) });
export const DecideRequest = z.object({ decision: z.enum(["approved", "denied"]) });
export const ApprovalResponse = z.object({ approval: Approval });

export const contracts = {
  health: {
    id: "health",
    method: "GET",
    path: "/api/health",
    summary: "Service and database health",
    response: HealthResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"],
  },
  listProjects: {
    id: "listProjects",
    method: "GET",
    path: "/api/projects",
    summary: "Registered managed projects",
    response: ProjectsResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"],
  },
  reloadProjects: {
    id: "reloadProjects",
    method: "POST",
    path: "/api/projects/reload",
    summary: "Re-read adapters/*.yaml and re-register projects",
    response: ReloadResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"],
  },
  listEvents: {
    id: "listEvents",
    method: "GET",
    path: "/api/events",
    summary: "Page of stored events after `since`",
    query: EventsQuery,
    response: EventsResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "VALIDATION_FAILED"],
  },
  eventStream: {
    id: "eventStream",
    method: "GET",
    path: "/api/events/stream",
    summary: "Live event stream (SSE). Resumes from Last-Event-ID or `since`.",
    query: EventStreamQuery,
    response: HarnessEvent,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "VALIDATION_FAILED"],
    stream: true,
  },
  invokeTool: {
    id: "invokeTool",
    method: "POST",
    path: "/api/tools/:tool/invoke",
    summary: "Internal: invoke a read-only tool through the permission engine",
    body: ToolInvokeRequest,
    response: ToolInvokeResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "VALIDATION_FAILED", "TOOL_DENIED", "NOT_FOUND"],
  },
  listCommands: {
    id: "listCommands",
    method: "GET",
    path: "/api/projects/:id/commands",
    summary: "Commands declared in the project's adapter",
    response: CommandsResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "NOT_FOUND"],
  },
  startRun: {
    id: "startRun",
    method: "POST",
    path: "/api/projects/:id/runs",
    summary: "Run a declared command in a fresh worktree from the base ref",
    body: StartRunRequest,
    response: RunResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "VALIDATION_FAILED", "NOT_FOUND"],
  },
  listRuns: {
    id: "listRuns",
    method: "GET",
    path: "/api/runs",
    summary: "Recent command runs",
    query: RunsQuery,
    response: RunsResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"],
  },
  getRun: {
    id: "getRun",
    method: "GET",
    path: "/api/runs/:id",
    summary: "One command run",
    response: RunResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "NOT_FOUND"],
  },
  runLog: {
    id: "runLog",
    method: "GET",
    path: "/api/runs/:id/log",
    summary: "Full (redacted) log of a run",
    response: RunLogResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "NOT_FOUND"],
  },
  runLogStream: {
    id: "runLogStream",
    method: "GET",
    path: "/api/runs/:id/log/stream",
    summary: "Live log lines (SSE, event: line / end)",
    response: z.string(),
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "NOT_FOUND"],
    stream: true,
  },
  cancelRun: {
    id: "cancelRun",
    method: "POST",
    path: "/api/runs/:id/cancel",
    summary: "Cancel a queued, waiting or running run (kills the process tree)",
    response: RunResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "NOT_FOUND"],
  },
  listApprovals: {
    id: "listApprovals",
    method: "GET",
    path: "/api/approvals",
    summary: "Approvals, optionally filtered by state",
    query: ApprovalsQuery,
    response: ApprovalsResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"],
  },
  decideApproval: {
    id: "decideApproval",
    method: "POST",
    path: "/api/approvals/:id/decide",
    summary: "PO approves or denies exactly one pending approval",
    body: DecideRequest,
    response: ApprovalResponse,
    errors: ["UNAUTHORIZED", "FORBIDDEN_ORIGIN", "VALIDATION_FAILED", "NOT_FOUND"],
  },
} as const satisfies Record<string, ContractDef>;

/** Fills `:param` placeholders of a contract path. */
export function pathOf(contract: ContractDef, params: Record<string, string> = {}): string {
  return contract.path.replace(/:([A-Za-z]+)/g, (_, k: string) =>
    encodeURIComponent(params[k] ?? ""),
  );
}

export type ContractId = keyof typeof contracts;
export type ResponseOf<C extends ContractDef> = z.infer<C["response"]>;
