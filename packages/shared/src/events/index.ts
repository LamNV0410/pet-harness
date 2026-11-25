// Event envelope and the M1 event catalog (05 §3, design.md §4). Payloads never contain secrets.
import { z } from "zod";
import { Decision, ProjectStatus, RunState } from "../domain/index.js";

const envelope = {
  id: z.number().int().positive(),
  ts: z.string(),
  actor: z.string(),
  correlationId: z.string(),
  causationId: z.number().int().positive().optional(),
};

function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({ ...envelope, type: z.literal(type), payload });
}

export const SystemStarted = event("system.started", z.object({ version: z.string() }));
export const ProjectRegistered = event(
  "project.registered",
  z.object({
    projectId: z.string(),
    name: z.string(),
    path: z.string(),
    baseRef: z.string(),
    status: ProjectStatus,
    reason: z.string().nullable(),
  }),
);
export const ProjectStatusChanged = event(
  "project.status_changed",
  z.object({ projectId: z.string(), status: ProjectStatus, reason: z.string().nullable() }),
);
export const AdapterRejected = event(
  "adapter.rejected",
  z.object({ file: z.string(), errors: z.array(z.string()) }),
);
export const ToolRequested = event(
  "tool.requested",
  z.object({
    toolCallId: z.string(),
    tool: z.string(),
    role: z.string(),
    projectId: z.string(),
    input: z.unknown(),
  }),
);
export const ToolDecided = event(
  "tool.decided",
  z.object({
    toolCallId: z.string(),
    tool: z.string(),
    decision: Decision,
    ruleId: z.string(),
    reason: z.string(),
  }),
);
export const ToolStarted = event(
  "tool.started",
  z.object({ toolCallId: z.string(), tool: z.string() }),
);
export const ToolFinished = event(
  "tool.finished",
  z.object({
    toolCallId: z.string(),
    tool: z.string(),
    ok: z.boolean(),
    durationMs: z.number(),
    outputBytes: z.number(),
    filtered: z.boolean(),
    error: z.string().nullable(),
  }),
);

export const RunStateChanged = event(
  "run.state_changed",
  z.object({
    runId: z.string(),
    projectId: z.string(),
    commandId: z.string(),
    state: RunState,
    sha: z.string().nullable(),
    exitCode: z.number().nullable(),
    summary: z.string().nullable(),
  }),
);
export const ApprovalRequested = event(
  "approval.requested",
  z.object({
    approvalId: z.string(),
    kind: z.string(),
    title: z.string(),
    subjectId: z.string(),
  }),
);
export const ApprovalDecided = event(
  "approval.decided",
  z.object({
    approvalId: z.string(),
    kind: z.string(),
    title: z.string(),
    subjectId: z.string(),
    decision: z.enum(["approved", "denied"]),
  }),
);
export const AgentEvent = event(
  "agent.activity",
  z.object({
    agentRunId: z.string(),
    role: z.string(),
    workItemId: z.string().nullable(),
    state: z.string(),
    text: z.string(),
  }),
);
export const WorkItemChanged = event(
  "workitem.changed",
  z.object({ workItemId: z.string(), title: z.string(), stage: z.string(), status: z.string() }),
);

export const HarnessEvent = z.discriminatedUnion("type", [
  SystemStarted,
  ProjectRegistered,
  ProjectStatusChanged,
  AdapterRejected,
  ToolRequested,
  ToolDecided,
  ToolStarted,
  ToolFinished,
  RunStateChanged,
  ApprovalRequested,
  ApprovalDecided,
  AgentEvent,
  WorkItemChanged,
]);
export type HarnessEvent = z.infer<typeof HarnessEvent>;
export type EventType = HarnessEvent["type"];
export type EventPayload<T extends EventType> = Extract<HarnessEvent, { type: T }>["payload"];
export const EVENT_TYPES: readonly EventType[] = HarnessEvent.options.map(
  (o) => o.shape.type.value,
);
