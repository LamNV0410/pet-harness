// Shared domain vocabulary: roles, statuses, tool names, decisions (design.md §4–5).
import { z } from "zod";

/** Runtime agent roles that may call tools. The PO and Orchestrator never call tools directly. */
export const ROLES = ["ba", "architect", "be", "fe", "tester", "release"] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export const ProjectStatus = z.enum(["available", "unavailable"]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** M1 tools. All are read-only (risk class "read"). */
export const TOOL_NAMES = [
  "fs.list",
  "fs.read",
  "search.text",
  "git.log",
  "git.show",
  "git.diff",
] as const;
export const ToolName = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolName>;

export const Decision = z.enum(["allow", "deny"]);
export type Decision = z.infer<typeof Decision>;

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  baseRef: z.string(),
  status: ProjectStatus,
  reason: z.string().nullable(),
  secretPaths: z.array(z.string()),
});
export type Project = z.infer<typeof Project>;

/** Schema of adapters/*.yaml. Only M1 fields are interpreted; `commands`/`health` are accepted as-is. */
export const AdapterFile = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase letters, digits and dashes"),
  name: z.string().min(1),
  path: z.string().min(1),
  baseRef: z.string().min(1),
  secretPaths: z.array(z.string().min(1)).default([]),
  generated: z.array(z.string().min(1)).default([]),
  commands: z
    .record(
      z.string(),
      z.lazy(() => AdapterCommand),
    )
    .default({}),
  health: z.object({ path: z.string() }).optional(),
});
export type AdapterFile = z.infer<typeof AdapterFile>;

/** One declared command in an adapter (M2). Only these argv vectors can ever run. */
export const AdapterCommand = z.object({
  argv: z.array(z.string().min(1)).min(1),
  approval: z.enum(["ask", "auto"]).default("auto"),
  /** "node-system": run npm/npx/node with the system Node (e.g. Node 20 for Angular 18). */
  toolchain: z.enum(["default", "node-system"]).default("default"),
  env: z.record(z.string(), z.string()).default({}),
  timeoutMinutes: z.number().int().min(1).max(180).default(20),
  maxRuntimeMinutes: z.number().int().min(1).max(180).optional(),
  port: z.number().int().optional(),
});
export type AdapterCommand = z.infer<typeof AdapterCommand>;

export const CommandInfo = z.object({
  id: z.string(),
  argv: z.array(z.string()),
  approval: z.enum(["ask", "auto"]),
  kind: z.enum(["verify", "server"]),
});
export type CommandInfo = z.infer<typeof CommandInfo>;

export const RunState = z.enum([
  "queued",
  "waiting_approval",
  "preparing",
  "running",
  "passed",
  "failed",
  "cancelled",
  "timed_out",
  "denied",
  "error",
  "cached",
]);
export type RunState = z.infer<typeof RunState>;
export const FINAL_RUN_STATES: readonly RunState[] = [
  "passed",
  "failed",
  "cancelled",
  "timed_out",
  "denied",
  "error",
  "cached",
];

export const CommandRun = z.object({
  id: z.string(),
  projectId: z.string(),
  commandId: z.string(),
  argv: z.array(z.string()),
  baseRef: z.string(),
  sha: z.string().nullable(),
  state: RunState,
  exitCode: z.number().nullable(),
  summary: z.string().nullable(),
  durationMs: z.number().nullable(),
  fetch: z.boolean(),
  keepWorktree: z.boolean(),
  worktree: z.string().nullable(),
  approvalId: z.string().nullable(),
  cachedFrom: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type CommandRun = z.infer<typeof CommandRun>;

export const ApprovalState = z.enum(["pending", "approved", "denied", "expired"]);
export const Approval = z.object({
  id: z.string(),
  kind: z.enum(["command", "gate", "tool"]),
  title: z.string(),
  detail: z.string(),
  effects: z.array(z.string()),
  requestedBy: z.string(),
  subjectId: z.string(),
  payloadHash: z.string(),
  state: ApprovalState,
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type Approval = z.infer<typeof Approval>;

/** Schema of policy/*.yaml (TD-05). */
export const PolicyRule = z.object({
  id: z.string().min(1),
  effect: z.enum(["allow", "deny"]),
  roles: z.array(z.string()).min(1),
  tools: z.array(z.string()).min(1),
});
export const PolicyFile = z.object({
  version: z.literal(1),
  rules: z.array(PolicyRule),
});
export type PolicyFile = z.infer<typeof PolicyFile>;
