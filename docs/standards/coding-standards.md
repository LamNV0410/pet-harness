# Coding Standards — general

Rules for every change by any agent. Area-specific rules live in separate files:

| File | Scope | Owner role |
|---|---|---|
| `backend-standards.md` | `../furwatch-api` and Harness `apps/backend` | BE Agent |
| `frontend-standards.md` | `../furwatch-app` and Harness `apps/frontend` | FE Agent |
| `contracts.md` | `packages/shared`, BE↔FE integration, product cross-repo contracts | Architect, BE, FE |
| `security-policy.md` | Everyone | — |
| `agent-design.md` | Workflow, ownership, gates | — |

Harness language-specific conventions will be added after the Technical Blueprint chooses a stack (D4).

## 1. Change discipline
- **One task, one branch.** Name branches `fw/<task-id>-<short-slug>`. Cut them from the branch the PO named; today that is `dev_v3` in both products. Never commit directly to `main`, `dev_v3` or `release/*`.
- **Smallest change that meets the acceptance criteria.**
  - No drive-by refactors, renames or formatting sweeps.
  - Note anything else you find in the task report as a follow-up.
- **Don't edit generated or vendored output.** The lists for each area are in `backend-standards.md` §2 and `frontend-standards.md` §2.
- **Don't add new committed clutter.** Examples: `.history/`, `.DS_Store`, `*.user`, `www.zip`, logs, uploaded files.
- **Commits** use `<type>(<area>): <summary>`. Types: feat, fix, test, refactor, docs, chore. Put the task ID in the body.

## 2. Evidence required to call a task done
- Paste the exact commands and a summary of their output in the task report.
- The required commands for each area are in `backend-standards.md` §4 and `frontend-standards.md` §4.
- For a `packages/shared` change, both apps must pass (`contracts.md` §2).
- If a step couldn't run, say so and why. Never report it as passed.

## 3. Documentation
- When a fact changes, update the matching discovery file: `docs/discovery/backend.md`, `frontend.md` or `integration.md`.
- Update a product's `CLAUDE.md` only with PO approval: it belongs to the product team.
- Don't create a new document when a section of an existing one fits.

## 4. Harness monorepo structure
- **Dependency direction:** `apps/backend` → `packages/shared` ← `apps/frontend`.
  - Never `apps/backend` ↔ `apps/frontend`.
  - Never `packages/shared` → `apps/*`.
  - `tests/` may depend on everything.
- **One owner per folder** (`agent-design.md` §2.1). A commit touches only folders owned by the task's owner. A contract task is the exception: it touches only `packages/shared` and the work item docs.
- **New top-level folders** (`apps/*`, `packages/*`) need a technical decision (TD) in `docs/architecture/08-technical-decisions.md`. Don't create speculative packages.
- **Root workspace config** (package, build and workspace manifests; CI; lint and format config) is owned by the Orchestrator and needs PO approval. It doesn't exist yet; it arrives with D4.
