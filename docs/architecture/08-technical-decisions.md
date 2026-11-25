# 08 — Technical Decisions

This file records the Harness technical decisions (TD). `open-decisions.md` tracks only status; the reasoning lives here.

**How a decision moves:**
1. The Architect proposes it.
2. `architecture-review` checks it.
3. The PO accepts it in chat (gate 2).
4. Its status changes from **PROPOSED** to **ACCEPTED** or **REJECTED**, and the date and the approver are recorded.

**What a decision does not cover:**
- **Exact versions.** They are fixed in the lockfile when packages are installed, and that install needs approval.
- **Superseded decisions** keep their entry, marked `SUPERSEDED by TD-NN`.

| TD | Topic | Resolves | Status |
|---|---|---|---|
| TD-01 | Technology stack | D4 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-02 | Contract format | D10 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-03 | Monorepo tooling and root layout | D11 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-04 | Backend↔frontend transport | D12 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-05 | Permission model | D6 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-06 | Model provider port and agent loop | D5 (mechanism only) | ACCEPTED (PO, gate 2, 2026-11-25). Its first adapter is SUPERSEDED by TD-12 |
| TD-07 | Worktrees and product runtime isolation | D3 (Harness side) | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-08 | Workflow state, events and recovery | D13 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-09 | Cost controls | D15 (mechanism only) | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-10 | One role definition for Claude Code and runtime | — | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-11 | Virtual Office rendering | D14 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-12 | Claude Code CLI as the first agent executor (subscription, no API key) | D5 | ACCEPTED (PO, 2026-11-25). Replaces the first adapter of TD-06 |

---

## TD-01 Technology stack (D4)
**Context**
- The Harness needs:
  - a local backend and a single-page web frontend;
  - a shared contract package;
  - an embedded database;
  - process and git control.
- It runs on Windows 11.
- It must stay independent of the product stacks.
- Installed today (VERIFIED, `01` C8):
  - Node 20.20.1. INFERRED to be past end-of-life.
  - corepack, .NET SDK 10, Python 3.11, git, ripgrep, Chrome.
  - pnpm and Docker are not installed.

**Options**

| | A. TypeScript end-to-end | B. .NET 10 backend + TS frontend | C. Python backend + TS frontend |
|---|---|---|---|
| Shared contracts | Real shared code (Zod) | OpenAPI + codegen both ways | OpenAPI + codegen |
| New installs | Node 24 LTS, pnpm | None for backend (SDK installed) | Python deps manager |
| Strengths | One language and toolchain. Strongest agent/LLM SDK ecosystem. In-process contract tests. | Same language as furwatch-api. Mature, fast runtime. | Rich AI ecosystem |
| Weaknesses | Native SQLite driver on Windows: UNKNOWN until tried | Two languages. `packages/shared` becomes generated artifacts. | Two languages. Weakest typing at the boundary. Windows packaging. |
| Cost to build | Lowest | Medium | Medium |

**Decision:** A.

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 LTS. VERIFIED 2026-11-25: 24.22.3 (Krypton LTS), installed through fnm next to the system Node 20 and pinned in `.node-version` |
| Language | TypeScript, strict |
| Backend | Fastify, Zod |
| Database | SQLite via Drizzle ORM + drizzle-kit migrations |
| Frontend | React, Vite, TanStack Query |
| Tests | Vitest, Playwright (using the installed Chrome) |
| Lint/format | Biome |

**Fallback:** if the native SQLite driver fails to install, use Node's built-in SQLite module.

**Consequences**
- Needs gate-4 approval for the installs.
- If B is chosen instead, TD-02 switches to OpenAPI-first.

## TD-02 Contract format (D10)
**Decision:** Zod schemas in `packages/shared`.
- They define the HTTP endpoints, the error shape and the event catalog (05 §3).
- The TypeScript types are inferred from the schemas.
- `openapi.json` is generated from them as a build artifact and used for contract tests.

**Alternatives:**
- OpenAPI-first with codegen. Required if TD-01 picks B.
- Types only. Rejected: it gives no runtime validation.

**Trade-off:** Zod becomes a runtime dependency of `packages/shared`. It is a pure validation library, and is the one allowed exception to the "no framework code" rule.

## TD-03 Monorepo tooling and root layout (D11)
**Decision:** pnpm workspaces and TypeScript project references, with no Turborepo or Nx until build times call for it.

**Lockfile:** `pnpm-lock.yaml` is committed, and CI and agents install with `--frozen-lockfile`.

**Root files**
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `biome.json`
- `.node-version`

**New root folders**
- `adapters/` — owned by the Architect.
- `policy/` — owned by the Orchestrator. Agents can never write to it.
- `.harness/` — gitignored. Holds the database, logs, worktrees, env profiles and the session token.

**Trade-off:** pnpm needs to be enabled through corepack, which needs approval.

## TD-04 Backend↔frontend transport (D12)
**Decision:**
- **Commands and snapshots:** HTTP JSON.
- **Live updates:** a single SSE stream.
  - Event IDs come from the `events` table.
  - On reconnect, the client sends `Last-Event-ID` and gets any events it missed.
- **Security:** the server listens on 127.0.0.1 only, with a session token and Origin/Host checks.

**Alternatives:**
- WebSocket. Not needed: the only client → server messages are commands.
- Polling. Too slow for the Office and Timeline.

**Trade-off:** there is no interactive terminal in v1. Adding one would need a new TD.

## TD-05 Permission model (D6)
**Decision:** one policy engine for every tool call (04 §3).
- **Order:** deny → ask → allow. Anything unknown is denied.
- **Grants:** each role gets only the tools it needs (04 §2).
- **Never relaxable:**
  - reading secret paths is always denied;
  - gate actions always require approval.
- **Approvals:** bound to a hash of the payload and used once.
- **Audit:** every decision is recorded with the rule that matched.

**Alternative:** each provider's own permission system. Rejected: behaviour would differ per provider and secret handling would be inconsistent.

**Trade-off:** every capability has to be wrapped as a Harness tool, and the rules need tuning to avoid approval fatigue.

## TD-06 Model provider port and agent loop (D5 mechanism)
> The first adapter described here (Anthropic Messages API) is **SUPERSEDED by TD-12** (2026-11-25). The executor port and its capability flags remain in force. The Messages API stays an optional future executor.

**Decision:** the Harness owns the agent loop (02 §3), behind a provider port that has capability flags.

**First adapter: Anthropic**, using the official TypeScript SDK and the Messages API with client-defined tools.
- Default model: `claude-opus-5-5`. Cheaper tiers (`claude-sonnet-5-5`, `claude-haiku-5-5`) can be set per role.
- Streaming is always on.
- Refusal and `max_tokens` stop reasons are handled before any tool runs.
- The adapter never relies on a forced `tool_choice`, because the current Opus and Sonnet models reject it.

**Testing:** a fake provider replays scripted turns.

**Alternatives**
- **Claude Agent SDK.** Batteries included, but Anthropic-only, and its built-in tools sit outside TD-05. We will reconsider after M3.
- **Hosted managed agents.** Rejected: the work is local-first and the tools have to act on local repos.

**Still OPEN (D5):** which providers to support, and whether product code may be sent to a cloud provider at all.

## TD-12 Claude Code CLI as the first agent executor (D5)
**Status:** ACCEPTED (PO, 2026-11-25).
- It replaces the *first adapter* in TD-06.
- TD-06's executor port stays in force, and so does central permission enforcement (TD-05).

**Context**
- The PO uses Claude through a **Claude Code subscription**, not the API (PO, 2026-11-25). TD-06 assumed the Messages API, which needs a separate API key and per-token billing.
- VERIFIED 2026-11-25: there is no `claude` CLI on PATH on this machine. Claude Code is used through the desktop app.

**Facts** from the official Claude Code docs (headless, CLI reference, hooks, legal-and-compliance), checked 2026-11-25:

*Authentication and policy*
- `claude -p` uses the user's claude.ai login by default. `--bare` turns that off and needs an API key.
- The policy forbids third parties from offering Claude.ai login in their own apps, or from routing requests through subscription plans *on behalf of their users*.
- The policy allows an end user to sign in to the **unmodified** Claude Code binary with their own subscription.
- The published limits assume ordinary individual use.
- **Our reading:** a personal, local Harness that drives the unmodified binary with the PO's own login fits this policy. Distributing the Harness, or sharing the login, does not. This is our interpretation, not legal advice.

*Flags*
- Output: `--output-format stream-json` (requires `--verbose`).
- Limits: `--max-turns`, `--max-budget-usd`.
- Model and prompt: `--model`, `--append-system-prompt-file`.
- Tools and permissions: `--allowedTools`, `--disallowedTools`, `--tools`, `--permission-mode`, `--permission-prompt-tool`.
- MCP: `--mcp-config` together with `--strict-mcp-config`.
- Settings and directories: `--settings`, `--setting-sources`, `--add-dir`.
- Sessions: `--session-id`, `--resume`.

*The `result` message*
- It carries `session_id`, `usage`, `modelUsage`, `num_turns`, `permission_denials` and `total_cost_usd`.
- `total_cost_usd` is a client-side estimate, not billing.

*Hooks*
- An `http` PreToolUse hook POSTs every tool call to a URL. The response can be allow, deny, ask or defer.
- Deny rules always win.
- If the server can't be reached, the hook fails open, unless `onFailure: "block"` is set. That setting needs v2.1.295 or later.

**Options**

| | A. Claude Code CLI (`claude -p`) per run | B. Messages API (TD-06 as written) | C. Agent SDK |
|---|---|---|---|
| Credentials | The PO's own subscription, no API key | API key, billed per token | The docs point third-party products to API keys |
| Agent loop | Claude Code (built-in tools, context management, sessions) | Harness | SDK |
| Permission enforcement | HTTP PreToolUse hook to the Harness policy engine, plus allow/deny lists | Harness only | SDK hooks |
| Cost model | Subscription usage limits (5-hour and weekly windows) | Per token | Per token |
| Control and portability | Lower: tied to Claude Code's behaviour and versions | Full | Medium |

**Decision: Option A**, behind TD-06's executor port, so that B or a local model can be added later as further executors. Each agent run spawns one `claude` process, configured as follows:

| Setting | How |
|---|---|
| Working directory | The task worktree |
| Session | A new session for every run (`--session-id <uuid>`) |
| Model | Chosen per role (`--model`) |
| Limits | `--max-turns`, plus `--max-budget-usd` as a sanity cap on the cost estimate |
| Role prompt | The role skill, passed with `--append-system-prompt-file` (TD-10) |
| Output parsing | `--output-format stream-json --verbose`, parsed into Harness events (05 §3) |
| MCP tools | `--strict-mcp-config --mcp-config <harness MCP>`, which exposes only `cmd_run` (adapter command ids), `approval_request` and `artifact_write` |
| Built-in tools | Read, Grep, Glob, Edit and Write are allowed. Bash, WebFetch and WebSearch are disallowed. |
| Permission hook | A Harness-generated `--settings` file installs an **http PreToolUse hook** to the Harness policy engine (TD-05), with `onFailure: "block"` so it fails closed |
| Permission mode | Never `bypassPermissions` |

**When the policy says "ask"**
1. The hook returns `deny` with the message "approval requested: <id>".
2. The run ends.
3. After the PO decides, the Orchestrator resumes the run with `--resume <session_id>` (03 §6).

This is so no hook stays open while waiting for a person; the default hook timeout is 600 s.

**Usage limits**
- Concurrency limits (D15) throttle how many runs go at once.
- A `rate_limit` or `api_retry` signal pauses the queue and notifies the PO.
- UNKNOWN until tested: whether `claude -p` emits `rate_limit_event`.

**Consequences and risks**
- **Install.** The official Claude Code CLI must be installed and on PATH (gate 4). The minimum version is the one that supports `onFailure: "block"`; it is pinned in the adapter config.
- **Product CLAUDE.md.** The product's own `CLAUDE.md` in the worktree will be loaded. There is no documented way to skip it under subscription auth, because `--safe-mode` also disables hooks and MCP. The role prompt therefore states that the discovery docs override stale product instructions. RISK: the stale product docs still influence behaviour.
- **User settings.** The PO's own Claude Code user settings may load as well. Test in M3 whether `--setting-sources` can exclude them.
- **Cost.** Spending moves from dollars per token to subscription quota. Agents running in parallel use up the PO's own interactive quota.
- **Data.** Code goes to Anthropic, exactly as it already does when the PO uses Claude Code on these repos. By accepting this TD on 2026-11-25, the PO confirmed that this is acceptable (D5).
- **Control.** Some loop behaviour, such as compaction and retries, belongs to Claude Code. TD-08 resume relies on Claude Code's local session store.

## TD-07 Worktrees and product runtime isolation (D3 Harness side)
**Proposal**
- **One worktree per task** (03 §4), created from the adapter's base ref, never from the PO's own checkout.
- **Release candidates:** local `rc/WI-NNN` branches.
- **Pushes and merges:** only through gate 4.
- **`furwatch-api` won't be started for now.** Its `run` command stays disabled until D3 is resolved, because the Harness can't make a run free of side effects on its own (04 §7).

**OPEN (D3):** whether to request the product change that adds a local profile.

## TD-08 Workflow state, events and recovery (D13)
**Proposal**
- **Storage:** state tables plus an append-only event log, written in one transaction (05 §1).
  - This is not full event sourcing.
  - There is no message broker; an in-process bus is enough.
- **Sources of truth:**
  - workflow state lives in the database;
  - artifacts are Markdown in git, referenced by their content hash.
- **Resume:** replay the run's events, then reconcile non-idempotent tool calls. A resume needs the PO's confirmation (03 §6).

**Alternative:** full event sourcing. Rejected: it adds complexity that a local single-user system doesn't need.

## TD-09 Cost controls (D15 mechanism)
**Proposal**
- **No LLM in orchestration or the UI.**
- **Model tier per role.**
- **A stable, cached prompt prefix.**
- **Retrieval, not dumping files:** agents search and read what they need.
- **Artifacts instead of transcripts** when work is handed from one agent to the next.
- **Verification results cached per commit SHA.**
- **Budgets:** a token/cost budget per run (hard stop) and per day (pauses new runs). The full list is in 02 §6.

**OPEN (D15):** the default tier for each role, the budget amounts, the concurrency limits and the retention period.

## TD-10 One role definition for Claude Code and runtime
**Decision:** the role prompts the runtime Agent Engine uses come from `.claude/skills/*/SKILL.md`. The same text drives today's Claude Code workflow, so each role is defined once.

**Trade-off:** skill files then become runtime input. Changing a skill changes how runtime agents behave, so skill changes go through review like any other code.

## TD-11 Virtual Office rendering (D14)
**Decision:** DOM/SVG with CSS animations, behind a renderer interface, as a pure projection of events with no LLM calls (doc 06).

**Alternative:** a canvas/WebGL sprite engine, which could replace it later behind the same interface.
