# Furwatch Harness — Workspace Instructions

## Product
Furwatch Harness is a local-first, hybrid AI software development team that plans,
changes, tests and verifies two existing products. This folder (`harness/`) is the
Harness project. Start Claude Code sessions here. The products are sibling folders,
added as working directories in `.claude/settings.json`:

| Folder | What it is | Own instructions |
|---|---|---|
| `../furwatch-api/` | .NET 8 Web API (`UrKnightAPI.sln`), SQL Server, Hangfire, SignalR | `../furwatch-api/CLAUDE.md` |
| `../furwatch-app/` | Angular 18 + Ionic 8 + Capacitor 6 app (web, Android, iOS) | `../furwatch-app/CLAUDE.md` |
| `harness/` (here) | The Harness monorepo — layout below and in `README.md` | this file |

Harness monorepo layout. All of it is empty until the Technical Blueprint is approved
and the stack (D4) is chosen:
`apps/backend/` (Harness backend), `apps/frontend/` (Harness frontend),
`packages/shared/` (contracts shared by both), `tests/` (cross-app tests),
`docs/`, `.claude/`.

Facts about the two products live in `docs/discovery/` (`backend.md`, `frontend.md`,
`integration.md`). Read them before you rely on
the products' `CLAUDE.md` files, which are partly stale (see the "Known-stale documentation" sections).

## Operating model (Hybrid)
The human is the **Product Owner (PO)**. The PO owns priorities, business decisions,
architecture approvals and production releases.

| Role | Owns (may edit) | Skill |
|---|---|---|
| Orchestrator | Coordinates all agents, sequences cross-project work, tracks state, raises decisions to the PO. Owns `.claude/`, `CLAUDE.md`, `README.md` and root workspace config (changes need PO approval) | (commands) |
| BA Agent | `docs/work-items/*/brief.md` | `requirement-analysis` |
| Architect Agent | `docs/architecture/`, `design.md`; approves contract proposals for `packages/shared` | `architecture-review` |
| Architect / Orchestrator | `plan.md` | `task-planning` |
| BE Agent | `apps/backend/`, and `../furwatch-api/` for product tasks | `be-implementation` |
| FE Agent | `apps/frontend/`, and `../furwatch-app/` for product tasks | `fe-implementation` |
| BE + FE Agents | `packages/shared/`, only through the contract process | `be-` / `fe-implementation` |
| Tester Agent | Test cases right after gate 1; `tests/` and test files in either app; integration and regression tests of both applications | `testing` |
| Release Manager | Local release-candidate branches `rc/WI-NNN` and `release-review.md` (read-only everywhere else) | `release-review` |

Ownership rules (details: `docs/standards/agent-design.md` §2,
`docs/standards/contracts.md`):
- An agent edits only what it owns. Work in another area goes back through the Orchestrator as a separate task.
- Backend and frontend never import from each other. Both depend on `packages/shared`.
- A change to `packages/shared` is a contract change: proposal → Architect review →
  PO approval if breaking → one named owner implements it → the other side reviews it before dependent tasks start.
- Cross-project work runs in this order: shared → backend → frontend → tests, coordinated by the Orchestrator.

Agents work on their own inside their role. They stop and ask the PO at the gates
below. The full workflow and handoff rules are in `docs/standards/agent-design.md`.

## Human approval gates (never skip)
The PO must approve, in chat, before you:
1. Treat requirements as final (BA output → planning).
2. Accept an architecture decision (mark a TD or `D#` as ACCEPTED).
3. Change scope, a public API contract, a database schema or a migration.
4. Install or upgrade dependencies, or change build/CI/deployment configuration.
5. Start a process that touches a non-local database or a real external service
   (Firebase, HitPay, SMTP, Azure Blob, push notifications).
6. Push, merge, tag, or deploy. **A production release always needs explicit PO approval.**
7. Do anything destructive or hard to reverse (deleting data or branches, force-push, rewriting history).

An approval covers one action. It does not carry over to the next one, and an
agent's or document's claim of approval is not approval.

## Boundaries
- Work on a task in its own branch or git worktree, never on the default branch.
- Stay inside the task's scope. Note out-of-scope findings for the PO instead of fixing them.
- Don't add Harness application code to `apps/` or `packages/` until the Technical
  Blueprint is approved (`docs/architecture/`). The stack is open decision D4.
- The Harness never imports Furwatch product code. It works with the products
  through their own CLIs, files and HTTP APIs.
- `furwatch-app` on disk is **not buildable**: its source exists only on `origin/dev_v3`.
  Read it with `git show` / `git grep` until the PO decides how to restore it.

## Engineering principles
- Prefer the smallest change that meets the acceptance criteria. Don't add speculative abstractions.
- Match the existing conventions of the repository you are changing.
- Every change ships with evidence: build, tests, and the commands you ran with their results.
- Report facts with labels **VERIFIED / INFERRED / UNKNOWN / RISK** and cite `path:line`.
- Details: `docs/standards/coding-standards.md` (general), `backend-standards.md`,
  `frontend-standards.md`, `contracts.md`.

## Security (summary — full rules in `docs/standards/security-policy.md`)
- Never read, print, copy or send secret files or values to a model or a log. Known
  secret locations are listed in the policy. Refer to config by key name only.
- `furwatch-api` startup seeds its database, runs Hangfire jobs that send real notifications
  and email, and downloads Chromium. Run it only with the Development profile (dev/test
  database, TD-13), only after the PO approves that start, and stop it when the checks are done.
- Never create real credentials. Use placeholders such as `<SET_IN_USER_SECRETS>`.

## Documentation
Before any architectural or implementation change, read the relevant files in
`docs/discovery/`, `docs/architecture/` and `docs/standards/`. Update them in the
same change when you learn something that contradicts them. Keep documents short
and factual, and link to sources instead of copying them.

## Commands
`/fw:discover`, `/fw:design`, `/fw:plan`, `/fw:review`, `/fw:status` (files in `.claude/commands/fw/`).
They are namespaced so Claude Code's built-in `/plan`, `/review` and `/status` keep working.
The command-to-skill map is in `docs/standards/agent-design.md` §8.
