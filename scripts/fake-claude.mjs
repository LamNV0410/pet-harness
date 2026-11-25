#!/usr/bin/env node
// Fake Claude Code CLI for tests (roadmap M3: "tested with the fake executor").
// Select it with HARNESS_CLAUDE_BIN=<path to this file>. It speaks the same argv and
// stream-json output as `claude -p`, sends one Read call through the PreToolUse HTTP hook
// (so the fail-closed policy path is exercised), and in a write run edits one file in cwd.
// FAKE_CLAUDE_MODE=fail makes it end with an error result; =deny-secret asks to read .env.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sessionId = opt("--session-id") ?? "fake-session";
const settings = JSON.parse(readFileSync(opt("--settings"), "utf8"));
const hook = settings.hooks.PreToolUse[0].hooks[0];
const tools = (opt("--tools") ?? "").split(",");
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

let prompt = "";
for await (const c of process.stdin) prompt += c;

out({ type: "system", subtype: "init", model: "fake-claude", session_id: sessionId });

async function callTool(name, input) {
  out({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: `t${Date.now()}`, name, input }] },
  });
  try {
    const r = await fetch(hook.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...hook.headers },
      body: JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: name,
        tool_input: input,
      }),
    });
    const j = await r.json();
    return j.hookSpecificOutput?.permissionDecision ?? "deny";
  } catch {
    return "deny"; // onFailure: block
  }
}

const target =
  mode === "deny-secret" ? join(process.cwd(), ".env") : join(process.cwd(), "README.md");
const decision = await callTool("Read", { file_path: target });
out({
  type: "assistant",
  message: { content: [{ type: "text", text: `Read ${target}: ${decision}` }] },
});

let result;
if (prompt.startsWith("Implement this task") && tools.includes("Edit")) {
  const file = join(process.cwd(), "FAKE_AGENT_CHANGE.md");
  if ((await callTool("Write", { file_path: file, content: "x" })) === "allow") {
    appendFileSync(file, `Change made by the fake executor (${new Date().toISOString()}).\n`);
  }
  result =
    "## Report\n- FAKE_AGENT_CHANGE.md: added (fake executor).\n- Acceptance criteria: smoke only.";
} else if (/harness-tasks/.test(prompt)) {
  result = `## Design\nSmall change (fake). README.md:1\n\n\`\`\`harness-tasks\n[{"owner":"be","projectId":"furwatch-api","title":"Fake change","details":"Add FAKE_AGENT_CHANGE.md"}]\n\`\`\``;
} else {
  result = `# Brief (fake)\n\n## Problem\nFrom the inbox item. Evidence: README.md:1 (VERIFIED)\n\n## Acceptance criteria\n- AC1 smoke.`;
}

if (mode === "fail") {
  out({
    type: "result",
    subtype: "error_max_turns",
    is_error: true,
    result: "max turns reached",
    num_turns: 3,
    session_id: sessionId,
    total_cost_usd: 0,
    usage: {},
  });
} else {
  out({
    type: "result",
    subtype: "success",
    is_error: false,
    result,
    num_turns: 2,
    session_id: sessionId,
    total_cost_usd: 0.0123,
    usage: { input_tokens: 1200, output_tokens: 300 },
  });
}
