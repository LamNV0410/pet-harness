// HTTP contracts for M1 (design.md §4). The backend registers every route from these objects,
// and the frontend client is typed by them (OQ-15), so the two apps cannot drift apart.
import { z } from "zod";
import { Project } from "../domain/index.js";
import { ErrorCode } from "../errors/index.js";
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
} as const satisfies Record<string, ContractDef>;

export type ContractId = keyof typeof contracts;
export type ResponseOf<C extends ContractDef> = z.infer<C["response"]>;
