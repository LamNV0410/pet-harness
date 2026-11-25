// Permission engine (TD-05, design.md §5.4). Fixed checks run first and cannot be relaxed by policy:
// unknown tool/role/project -> path escape -> secret path -> writes (none in M1) -> policy rules
// (first match) -> default deny. Rule ids: fixed:<check> | policy:<id> (OQ-13).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PolicyFile, type PolicyFile as PolicyFileT, ROLES, TOOL_NAMES } from "@harness/shared";
import { parse as parseYaml } from "yaml";
import { GlobSet } from "./glob.js";
import { checkPath } from "./paths.js";

/** Global secret list from docs/standards/security-policy.md §1 (applies to every project). */
export const GLOBAL_SECRET_GLOBS = [
  "**/appsettings*.json",
  "**/ServiceAccounts/**",
  "**/Keys/**",
  "**/*.pubxml.user",
  "**/google-services.json",
  "**/GoogleService-Info*.plist",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.p8",
  "**/*.pfx",
  "**/*.key",
] as const;

export interface ProjectScope {
  readonly id: string;
  readonly root: string;
  readonly available: boolean;
  readonly secrets: GlobSet;
}

export type Verdict =
  | { decision: "allow"; ruleId: string; reason: string; paths: ResolvedTarget[] }
  | { decision: "deny"; ruleId: string; reason: string };

export interface ResolvedTarget {
  input: string;
  abs: string;
  rel: string;
  exists: boolean;
}

const READ_TOOLS = new Set<string>(TOOL_NAMES);
const ROLE_SET = new Set<string>(ROLES);

export class PermissionEngine {
  private policy: PolicyFileT = { version: 1, rules: [] };

  constructor(private readonly policyDir: string) {}

  loadPolicy(): void {
    const rules: PolicyFileT["rules"] = [];
    for (const f of readdirSync(this.policyDir)
      .filter((n) => /\.ya?ml$/i.test(n))
      .sort()) {
      const parsed = PolicyFile.parse(parseYaml(readFileSync(join(this.policyDir, f), "utf8")));
      rules.push(...parsed.rules);
    }
    this.policy = { version: 1, rules };
  }

  secretSetFor(adapterSecrets: readonly string[]): GlobSet {
    return new GlobSet([...GLOBAL_SECRET_GLOBS, ...adapterSecrets]);
  }

  evaluate(
    tool: string,
    role: string,
    project: ProjectScope | undefined,
    targets: readonly string[],
  ): Verdict {
    if (!READ_TOOLS.has(tool)) return deny("fixed:unknown-tool", `unknown tool "${tool}"`);
    if (!ROLE_SET.has(role)) return deny("fixed:unknown-role", `unknown role "${role}"`);
    if (!project) return deny("fixed:unknown-project", "project is not registered");
    if (!project.available) return deny("fixed:project-unavailable", "project path is unavailable");

    const resolved: ResolvedTarget[] = [];
    for (const t of targets) {
      const c = checkPath(project.root, t);
      if (!c.ok) return deny(c.ruleId, c.reason);
      if (project.secrets.matches(c.rel) || project.secrets.matches(c.lexicalRel)) {
        return deny(
          "fixed:secret-path",
          `"${t}" matches a secret path; its content can never be read`,
        );
      }
      // M1 has no write tools, so writes (including to policy/**) are impossible by construction.
      resolved.push({ input: t, abs: c.abs, rel: c.rel, exists: c.exists });
    }

    for (const rule of this.policy.rules) {
      const roleMatch = rule.roles.includes(role) || rule.roles.includes("*");
      const toolMatch = rule.tools.includes(tool) || rule.tools.includes("*");
      if (roleMatch && toolMatch) {
        return rule.effect === "allow"
          ? {
              decision: "allow",
              ruleId: `policy:${rule.id}`,
              reason: "allowed by policy",
              paths: resolved,
            }
          : deny(`policy:${rule.id}`, "denied by policy");
      }
    }
    return deny("fixed:default-deny", "no policy rule allows this call");
  }
}

function deny(ruleId: string, reason: string): Verdict {
  return { decision: "deny", ruleId, reason };
}
