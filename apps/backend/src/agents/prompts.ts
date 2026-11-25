// Role prompts. The role definition is the same skill text the Claude Code workflow uses (TD-10),
// plus a short runtime contract describing what the Harness expects back.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole } from "@harness/shared";

const SKILL_OF: Record<AgentRole, string> = {
  ba: "requirement-analysis",
  architect: "architecture-review",
  be: "be-implementation",
  fe: "fe-implementation",
  tester: "testing",
  release: "release-review",
};

const RUNTIME_RULES = `
## Furwatch Harness runtime rules (these override anything above that conflicts)
- You are running non-interactively inside Furwatch Harness. Nobody can answer questions mid-run.
- Secret files (appsettings*.json, service accounts, keys, Firebase configs, environment files) have been
  removed from your working copy on purpose. Never try to find, recreate or guess their values.
- You cannot run shell commands. The Harness builds and tests your work after you finish.
- Do not create files under docs/work-items; the Harness stores your report itself.
- The product's own CLAUDE.md may be stale; the requirement and design given to you win.
- End with your final report as plain Markdown in your last message (no preamble like "Here is").
`;

export function rolePrompt(harnessRoot: string, role: AgentRole): string {
  const file = join(harnessRoot, ".claude", "skills", SKILL_OF[role], "SKILL.md");
  const skill = existsSync(file)
    ? readFileSync(file, "utf8").replace(/^---[\s\S]*?---\s*/, "")
    : `You are the ${role} agent.`;
  return `${skill}\n${RUNTIME_RULES}`;
}

export function baPrompt(title: string, description: string, projectId: string): string {
  return `Analyze this requirement from the Product Owner for the project "${projectId}".
Your working directory is a read-only copy of that project at its base branch. Read the relevant code to ground the analysis (cite path:line).

# Requirement: ${title}
${description}

Produce the requirement brief exactly in the format of your skill (Goal, Current behaviour with path:line,
Questions for PO with proposed defaults, User stories with Given/When/Then acceptance criteria, Non-functional notes and risks, Out of scope).
Keep it concise: at most 3 user stories unless the requirement clearly needs more.`;
}

export function architectPrompt(
  title: string,
  brief: string,
  projectId: string,
  note: string | null,
): string {
  return `Design the technical solution for this approved requirement in project "${projectId}" and split it into implementation tasks.
Your working directory is a read-only copy of the project. Read the code you need.
${note ? `\nPO feedback on the previous attempt:\n${note}\n` : ""}
# Approved requirement brief: ${title}
${brief}

Write a short design note (approach, files/modules to change with paths, contract or schema impact, risks).
Then end your report with exactly one fenced block tagged harness-tasks containing JSON:
\`\`\`harness-tasks
[{"owner":"be"|"fe","projectId":"furwatch-api"|"furwatch-app","title":"...","details":"- what to change\\n- which files\\n- tests\\n- acceptance criteria covered"}]
\`\`\`
Use owner "be" with projectId "furwatch-api" and owner "fe" with projectId "furwatch-app" (the work item is for ${projectId}). Write "details" as a short markdown list (one point per line, joined with \\n), not one long paragraph. Prefer 1-3 tasks.`;
}

export function implementPrompt(
  role: "be" | "fe",
  task: { title: string; details: string },
  brief: string,
  design: string,
  note: string | null,
): string {
  return `Implement this task. Your working directory is a dedicated git worktree on a new task branch; edit files there only.
Make the smallest change that satisfies the task and its acceptance criteria, following the existing code patterns.
Add or update tests next to the code when the project has a test pattern for it. Do not run commands; the Harness will build and test after you finish.
${note ? `\nPO feedback on the previous attempt:\n${note}\n` : ""}
# Task (${role.toUpperCase()}): ${task.title}
${task.details}

# Requirement brief
${brief}

# Design
${design}

Finish with a short report: files changed and why, acceptance criteria covered, anything not done.`;
}

/** Models sometimes put real line breaks inside JSON strings; escape them so JSON.parse accepts it. */
function escapeRawNewlines(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i] as string;
    if (inString && c === "\\") {
      out += c + (json[++i] ?? "");
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString && c === "\n") out += "\\n";
    else if (inString && c === "\r") continue;
    else if (inString && c === "\t") out += "\\t";
    else out += c;
  }
  return out;
}

/** Extracts the harness-tasks JSON block from an Architect report. */
export function parseTasks(
  text: string,
): { owner: "be" | "fe"; projectId: string; title: string; details: string }[] {
  const m = /```harness-tasks\s*([\s\S]*?)```/.exec(text);
  if (!m?.[1]) return [];
  try {
    const arr = JSON.parse(escapeRawNewlines(m[1])) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => ({
        owner: t.owner === "fe" ? "fe" : "be",
        // FE work lives in furwatch-app, BE work in furwatch-api, whatever the model wrote.
        projectId: t.owner === "fe" ? "furwatch-app" : "furwatch-api",
        title: String(t.title ?? "task").slice(0, 200),
        details: String(t.details ?? "").slice(0, 8000),
      }));
  } catch {
    return [];
  }
}
