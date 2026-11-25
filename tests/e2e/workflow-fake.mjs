// E2E (M3–M5): a work item goes inbox → gate1 → gate2 → build → verify → gate4 → done
// with the fake Claude executor (scripts/fake-claude.mjs). Also checks the PreToolUse hook
// fails closed (unknown run, secret path) and that every agent tool call is audited.
// Usage: node tests/e2e/workflow-fake.mjs   (after `pnpm build`). Uses a temp HARNESS_HOME.
// Task branches get a unique prefix (fw-e2e-<id>/) so they never touch real fw/* branches;
// the test removes its own worktrees and branches at the end. Nothing is pushed.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const home = mkdtempSync(join(tmpdir(), "harness-e2e-"));
const port = 7499;
const prefix = `fw-e2e-${Date.now().toString(36)}/`;
const base = `http://127.0.0.1:${port}`;
const proc = spawn(process.execPath, [join(root, "apps/backend/dist/main.js")], {
  env: {
    ...process.env,
    HARNESS_HOME: home,
    HARNESS_PORT: String(port),
    HARNESS_CLAUDE_BIN: join(root, "scripts/fake-claude.mjs"),
    HARNESS_BRANCH_PREFIX: prefix,
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
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
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
  await until(
    "health",
    async () => {
      try {
        token = readFileSync(join(home, "session"), "utf8").trim();
        return (
          await fetch(`${base}/api/health`, { headers: { authorization: `Bearer ${token}` } })
        ).ok;
      } catch {
        return false;
      }
    },
    30_000,
  );

  // Hook fails closed.
  const unknown = await api("POST", "/api/hooks/pretooluse?run=nope", {
    tool_name: "Read",
    tool_input: { file_path: "x" },
  });
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
      if (w.status === "failed" || w.status === "blocked" || w.stage === "cancelled")
        throw new Error(`work item failed: ${JSON.stringify(w)}`);
      const { approvals } = await api("GET", "/api/approvals?state=pending");
      const hit = approvals.find((x) => x.subjectId?.startsWith(`wi:${wid}`));
      return hit ? { ...hit, stage: w.stage } : null;
    });
    await api("POST", `/api/approvals/${a.id}/decide`, { decision: "approved" });
    console.log(`approved: ${a.title}`);
    if (gate !== "gate" && a.kind === "gate" && a.stage !== gate)
      throw new Error(`expected ${gate}, got ${a.stage}`);
    return a;
  };

  await approveGate("gate1");
  const d1 = await api("GET", `/api/workitems/${wid}`);
  check(
    "BA brief has a path:line citation",
    d1.artifacts.some((x) => x.kind === "brief" && /\w+\.\w+:\d+/.test(x.content)),
  );
  await approveGate("gate2");
  // Verify may ask for command approvals (approval: ask); approve until gate4 is reached.
  for (;;) {
    const a = await approveGate("gate");
    if (a.kind === "gate" && a.stage === "gate4") break;
  }
  const w = await until(
    "done",
    async () => ((await stage()).stage === "done" ? await stage() : null),
    60_000,
  );
  check("work item reaches done", w.stage === "done");

  const det = await api("GET", `/api/workitems/${wid}`);
  check(
    "task committed on a branch",
    det.tasks.every((t) => t.commit && t.branch),
  );
  const { agentRuns } = await api("GET", "/api/agent-runs");
  check(
    "agent runs recorded with usage",
    agentRuns.length >= 3 &&
      agentRuns.every((r) => r.state === "succeeded" || r.state === "done" || r.costUsd !== null),
    `${agentRuns.length} runs`,
  );

  const started = {};
  for (const r of agentRuns) {
    const det = await api("GET", `/api/agent-runs/${r.id}`);
    const s = det.activity.find((a) => a.text.startsWith("session started"));
    started[r.role] = s?.text ?? "";
  }
  check(
    "per-role model and effort",
    started.ba?.includes("fake-opus, effort low") &&
      started.architect?.includes("fake-opus, effort medium") &&
      started.be?.includes("fake-sonnet, effort medium"),
    JSON.stringify(started),
  );

  // Secret read through a real run id is denied and audited.
  const sec = await api("POST", `/api/hooks/pretooluse?run=${agentRuns[0].id}`, {
    tool_name: "Read",
    tool_input: { file_path: join(root, "../furwatch-api/UrKnightAPI/appsettings.json") },
    cwd: root,
  });
  check(
    "hook denies a secret path",
    sec.hookSpecificOutput.permissionDecision === "deny",
    sec.hookSpecificOutput.permissionDecisionReason,
  );
  const bash = await api("POST", `/api/hooks/pretooluse?run=${agentRuns[0].id}`, {
    tool_name: "Bash",
    tool_input: { command: "ls" },
  });
  check("hook denies shell", bash.hookSpecificOutput.permissionDecision === "deny");
  const ev = await api("GET", "/api/events?limit=500").catch(() => ({ events: [] }));
  const audited = (ev.events ?? []).filter(
    (e) => e.type === "tool.requested" && String(e.payload?.tool).startsWith("claude."),
  ).length;
  check("agent tool calls audited", audited >= 4, `${audited} tool.requested events`);
} catch (e) {
  check("workflow", false, e.message);
} finally {
  proc.kill();
  await new Promise((r) => proc.once("exit", r));
  cleanupRepos();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed (HARNESS_HOME=${home})`);
process.exit(failed ? 1 : 0);

/** Removes this run's worktrees (under its temp HARNESS_HOME) and its fw-e2e-* branches. */
function cleanupRepos() {
  for (const repo of ["furwatch-api", "furwatch-app"].map((p) => resolve(root, "..", p))) {
    const g = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });
    try {
      const homeFwd = home.replace(/\\/g, "/").toLowerCase();
      for (const line of g("worktree", "list", "--porcelain").split("\n")) {
        const wt = line.startsWith("worktree ") ? line.slice(9).trim() : "";
        if (wt && wt.replace(/\\/g, "/").toLowerCase().startsWith(homeFwd)) {
          g("worktree", "remove", "--force", wt);
        }
      }
      g("worktree", "prune");
      const branches = g("branch", "--list", `${prefix}*`, "--format=%(refname:short)")
        .split("\n")
        .filter(Boolean);
      for (const b of branches) g("branch", "-D", b);
      if (branches.length) console.log(`cleanup: ${repo} removed ${branches.join(", ")}`);
    } catch (e) {
      console.log(`cleanup warning (${repo}): ${e.message.split("\n")[0]}`);
    }
  }
}
