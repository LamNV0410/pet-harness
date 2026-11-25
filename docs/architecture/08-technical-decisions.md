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
| TD-06 | Model provider port and agent loop | D5 (mechanism only) | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-07 | Worktrees and product runtime isolation | D3 (Harness side) | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-08 | Workflow state, events and recovery | D13 | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-09 | Cost controls | D15 (mechanism only) | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-10 | One role definition for Claude Code and runtime | — | ACCEPTED (PO, gate 2, 2026-11-25) |
| TD-11 | Virtual Office rendering | D14 | ACCEPTED (PO, gate 2, 2026-11-25) |

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
| Runtime | Node.js 24 LTS. Its LTS status is INFERRED from the published schedule; confirm at install. |
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
