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
  commands: z.record(z.string(), z.unknown()).optional(),
  health: z.record(z.string(), z.unknown()).optional(),
});
export type AdapterFile = z.infer<typeof AdapterFile>;

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
