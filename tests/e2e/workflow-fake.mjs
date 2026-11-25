// E2E (M3–M5): a work item goes inbox → gate1 → gate2 → build → verify → gate4 → done
// with the fake Claude executor (scripts/fake-claude.mjs). Also checks the PreToolUse hook
// fails closed (unknown run, secret path) and that every agent tool call is audited.
// Usage: node tests/e2e/workflow-fake.mjs   (after `pnpm build`). Uses a temp HARNESS_HOME.
// Side effect: a local task branch fw/wi-001-t1 in ../furwatch-api (never pushed).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const home = mkdtempSync(join(tmpdir(), "harness-e2e-"));
const port = 7499;
const base = `http://127.0.0.1:${port}`;
const proc = spawn(process.execPath, [join(root, "apps/backend/dist/main.js")], {
  env: {
    ...process.env,
    HARNESS_HOME: home,
    HARNESS_PORT: String(port),
    HARNESS_CLAUDE_BIN: join(root, "scripts/fake-claude.mjs"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
proc.stdout.on("data", (d) => process.stdout.write(`[harness] ${d}`));
proc.stderr.on("data", (d) => process.stderr.write(`[harness] ${d}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = "";
async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function until(what, fn, ms = 900_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${what}`);
}
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await until("health", async () => {
    try {
      token = readFileSync(join(home, "session"), "utf8").trim();
      return (await fetch(`${base}/api/health`, { headers: { authorization: `Bearer ${token}` } })).ok;
    } catch {
      return false;
    }
  }, 30_000);

  // Hook fails closed.
  const unknown = await api("POST", "/api/hooks/pretooluse?run=nope", { tool_name: "Read", tool_input: { file_path: "x" } });
  check("hook denies an unknown run", unknown.hookSpecificOutput.permissionDecision === "deny");

  const { workItem } = await api("POST", "/api/workitems", {
    title: "E2E fake change",
    description: "Smoke test of the agent workflow.",
    projectId: "furwatch-api",
  });
  const wid = workItem.id;
  const stage = async () => (await api("GET", `/api/workitems/${wid}`)).workItem;
  const approveGate = async (gate) => {
    const a = await until(`${gate} approval`, async () => {
      const w = await stage();
      if (w.status === "failed" || w.stage === "cancelled") throw new Error(`work item failed: ${JSON.stringify(w)}`);
      const { approvals } = await api("GET", "/api/approvals?state=pending");
      const hit = approvals.find((x) => x.subjectId?.startsWith(`wi:${wid}`));
      return hit ? { ...hit, stage: w.stage } : null;
    });
    await api("POST", `/api/approvals/${a.id}/decide`, { decision: "approved" });
    console.log(`approved: ${a.title}`);
    if (gate !== "gate" && a.kind === "gate" && a.stage !== gate) throw new Error(`expected ${gate}, got ${a.stage}`);
    return a;
  };

  await approveGate("gate1");
  const d1 = await api("GET", `/api/workitems/${wid}`);
  check("BA brief has a path:line citation", d1.artifacts.some((x) => x.kind === "brief" && /\w+\.\w+:\d+/.test(x.content)));
  await approveGate("gate2");
  // Verify may ask for command approvals (approval: ask); approve until gate4 is reached.
  for (;;) {
    const a = await approveGate("gate");
    if (a.kind === "gate" && a.stage === "gate4") break;
  }
  const w = await until("done", async () => ((await stage()).stage === "done" ? await stage() : null), 60_000);
  check("work item reaches done", w.stage === "done");

  const det = await api("GET", `/api/workitems/${wid}`);
  check("task committed on a branch", det.tasks.every((t) => t.commit && t.branch));
  const { agentRuns } = await api("GET", "/api/agent-runs");
  check("agent runs recorded with usage", agentRuns.length >= 3 && agentRuns.every((r) => r.state === "succeeded" || r.state === "done" || r.costUsd !== null), `${agentRuns.length} runs`);

  // Secret read through a real run id is denied and audited.
  const sec = await api("POST", `/api/hooks/pretooluse?run=${agentRuns[0].id}`, { tool_name: "Read", tool_input: { file_path: join(root, "../furwatch-api/UrKnightAPI/appsettings.json") }, cwd: root });
  check("hook denies a secret path", sec.hookSpecificOutput.permissionDecision === "deny", sec.hookSpecificOutput.permissionDecisionReason);
  const bash = await api("POST", `/api/hooks/pretooluse?run=${agentRuns[0].id}`, { tool_name: "Bash", tool_input: { command: "ls" } });
  check("hook denies shell", bash.hookSpecificOutput.permissionDecision === "deny");
  const ev = await api("GET", "/api/events?limit=500").catch(() => ({ events: [] }));
  const audited = (ev.events ?? []).filter((e) => e.type === "tool.requested" && String(e.payload?.tool).startsWith("claude.")).length;
  check("agent tool calls audited", audited >= 4, `${audited} tool.requested events`);
} catch (e) {
  check("workflow", false, e.message);
} finally {
  proc.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed (HARNESS_HOME=${home})`);
process.exit(failed ? 1 : 0);
