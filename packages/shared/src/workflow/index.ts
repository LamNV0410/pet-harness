// M3–M6 shared schemas and contracts: work items, agents, tasks, dashboard, product servers.
import { z } from "zod";
import type { ContractDef } from "../contracts/index.js";
import { CommandRun } from "../domain/index.js";

export const AGENT_ROLES = ["ba", "architect", "be", "fe", "tester", "release"] as const;
export const AgentRole = z.enum(AGENT_ROLES);
export type AgentRole = z.infer<typeof AgentRole>;

export const Stage = z.enum([
  "inbox",
  "analysis",
  "gate1",
  "design",
  "gate2",
  "build",
  "verify",
  "gate4",
  "done",
  "cancelled",
]);
export type Stage = z.infer<typeof Stage>;
export const STAGES: readonly Stage[] = Stage.options;

export const WorkItemStatus = z.enum(["active", "waiting_po", "blocked", "done", "cancelled"]);
export type WorkItemStatus = z.infer<typeof WorkItemStatus>;

export const Artifact = z.object({
  kind: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  agentRunId: z.string().nullable(),
});
export type Artifact = z.infer<typeof Artifact>;

export const Task = z.object({
  id: z.string(),
  workItemId: z.string(),
  owner: AgentRole,
  projectId: z.string(),
  title: z.string(),
  details: z.string(),
  status: z.enum(["pending", "running", "done", "failed", "blocked"]),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  baseSha: z.string().nullable(),
});
export type Task = z.infer<typeof Task>;

export const WorkItem = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  projectId: z.string(),
  stage: Stage,
  status: WorkItemStatus,
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkItem = z.infer<typeof WorkItem>;

export const AgentRunState = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type AgentRunState = z.infer<typeof AgentRunState>;
export const AgentRun = z.object({
  id: z.string(),
  workItemId: z.string(),
  taskId: z.string().nullable(),
  role: AgentRole,
  purpose: z.string(),
  state: AgentRunState,
  sessionId: z.string().nullable(),
  turns: z.number().nullable(),
  costUsd: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const Activity = z.object({
  ts: z.string(),
  kind: z.enum(["text", "tool", "denied", "result", "error", "info"]),
  text: z.string(),
});
export type Activity = z.infer<typeof Activity>;

export const ServerState = z.enum([
  "stopped",
  "waiting_approval",
  "starting",
  "healthy",
  "unhealthy",
  "stopping",
  "failed",
]);
export const ServerStatus = z.object({
  projectId: z.string(),
  commandId: z.string(),
  state: ServerState,
  url: z.string().nullable(),
  pid: z.number().nullable(),
  startedAt: z.string().nullable(),
  stopsAt: z.string().nullable(),
  lastHealth: z.string().nullable(),
  sha: z.string().nullable(),
  approvalId: z.string().nullable(),
});
export type ServerStatus = z.infer<typeof ServerStatus>;

// ---- contracts -------------------------------------------------------------------------------
export const CreateWorkItemRequest = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(20_000),
  projectId: z.string().min(1),
});
export const WorkItemsResponse = z.object({ workItems: z.array(WorkItem) });
export const WorkItemDetail = z.object({
  workItem: WorkItem,
  artifacts: z.array(Artifact),
  tasks: z.array(Task),
  agentRuns: z.array(AgentRun),
  runs: z.array(CommandRun),
  pendingApprovalId: z.string().nullable(),
});
export type WorkItemDetail = z.infer<typeof WorkItemDetail>;
export const DiffEntry = z.object({
  taskId: z.string(),
  projectId: z.string(),
  branch: z.string(),
  files: z.array(z.string()),
  withheld: z.array(z.string()),
  patch: z.string(),
});
export const DiffResponse = z.object({ diffs: z.array(DiffEntry) });
export const AgentRunDetail = z.object({
  agentRun: AgentRun,
  activity: z.array(Activity),
  output: z.string().nullable(),
});
export const AgentRunsResponse = z.object({ agentRuns: z.array(AgentRun) });
export const WorkItemActionRequest = z.object({
  action: z.enum(["retry", "cancel"]),
  note: z.string().max(5000).optional(),
});
export const DashboardResponse = z.object({
  agents: z.object({ cli: z.string().nullable(), running: z.number(), queued: z.number() }),
  workItems: z.record(z.string(), z.number()),
  pendingApprovals: z.number(),
  runs: z.object({ running: z.number(), passed24h: z.number(), failed24h: z.number() }),
  usage: z.object({
    costUsd: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    agentRuns: z.number(),
  }),
  servers: z.array(ServerStatus),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;
export const ServersResponse = z.object({ servers: z.array(ServerStatus) });
export const ServerResponse = z.object({ server: ServerStatus });

const E = ["UNAUTHORIZED", "FORBIDDEN_ORIGIN"] as const;

export const workflowContracts = {
  listWorkItems: {
    id: "listWorkItems",
    method: "GET",
    path: "/api/workitems",
    summary: "All work items",
    response: WorkItemsResponse,
    errors: E,
  },
  createWorkItem: {
    id: "createWorkItem",
    method: "POST",
    path: "/api/workitems",
    summary: "Requirement Inbox: submit a requirement; the BA agent starts",
    body: CreateWorkItemRequest,
    response: z.object({ workItem: WorkItem }),
    errors: [...E, "VALIDATION_FAILED", "NOT_FOUND"],
  },
  getWorkItem: {
    id: "getWorkItem",
    method: "GET",
    path: "/api/workitems/:id",
    summary: "Work item with artifacts, tasks, agent runs and verification runs",
    response: WorkItemDetail,
    errors: [...E, "NOT_FOUND"],
  },
  workItemAction: {
    id: "workItemAction",
    method: "POST",
    path: "/api/workitems/:id/action",
    summary: "Retry the current stage (optionally with a note) or cancel the work item",
    body: WorkItemActionRequest,
    response: z.object({ workItem: WorkItem }),
    errors: [...E, "VALIDATION_FAILED", "NOT_FOUND"],
  },
  workItemDiff: {
    id: "workItemDiff",
    method: "GET",
    path: "/api/workitems/:id/diff",
    summary: "Code changes of the work item's task branches (secrets withheld)",
    response: DiffResponse,
    errors: [...E, "NOT_FOUND"],
  },
  listAgentRuns: {
    id: "listAgentRuns",
    method: "GET",
    path: "/api/agent-runs",
    summary: "Recent agent runs",
    response: AgentRunsResponse,
    errors: E,
  },
  getAgentRun: {
    id: "getAgentRun",
    method: "GET",
    path: "/api/agent-runs/:id",
    summary: "One agent run with its activity and output",
    response: AgentRunDetail,
    errors: [...E, "NOT_FOUND"],
  },
  cancelAgentRun: {
    id: "cancelAgentRun",
    method: "POST",
    path: "/api/agent-runs/:id/cancel",
    summary: "Stop an agent run",
    response: z.object({ agentRun: AgentRun }),
    errors: [...E, "NOT_FOUND"],
  },
  preToolUseHook: {
    id: "preToolUseHook",
    method: "POST",
    path: "/api/hooks/pretooluse",
    summary: "Claude Code PreToolUse HTTP hook: every agent tool call is decided here",
    response: z.unknown(),
    errors: E,
  },
  dashboard: {
    id: "dashboard",
    method: "GET",
    path: "/api/dashboard",
    summary: "Agent dashboard summary",
    response: DashboardResponse,
    errors: E,
  },
  listServers: {
    id: "listServers",
    method: "GET",
    path: "/api/servers",
    summary: "Product servers (M6)",
    response: ServersResponse,
    errors: E,
  },
  startServer: {
    id: "startServer",
    method: "POST",
    path: "/api/servers/:id/start",
    summary: "Request a product server start (always needs PO approval)",
    response: ServerResponse,
    errors: [...E, "VALIDATION_FAILED", "NOT_FOUND"],
  },
  stopServer: {
    id: "stopServer",
    method: "POST",
    path: "/api/servers/:id/stop",
    summary: "Stop a product server",
    response: ServerResponse,
    errors: [...E, "NOT_FOUND"],
  },
} as const satisfies Record<string, ContractDef>;
