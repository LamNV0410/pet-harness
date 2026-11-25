# Open Decisions

Tracks the **status** of every decision. The technical reasoning lives in `08-technical-decisions.md` (TD-NN).

| Status | Meaning |
|---|---|
| **OPEN** | No proposal has been accepted. Waiting for the PO or for missing information. |
| **PROPOSED** | A recommendation exists (TD-NN). Waiting for the PO at gate 2. |
| **ACCEPTED** | Decided by the PO in chat; the date is recorded. |

The Owner prepares the options. The PO decides. Reviewed 2026-11-25 for Technical Blueprint v0.2. The PO accepted v0.2 at gate 2 on 2026-11-25. That accepted every PROPOSED item. Items that need a specific choice or a one-off action approval stay OPEN.

| # | Decision | Owner | Status | Blocks | Notes |
|---|---|---|---|---|---|
| D1 | Which `furwatch-app` branch is authoritative (`origin/dev_v3`, `origin/minew-report` or a release branch), and how to get a buildable local checkout | Release Manager | **ACCEPTED** (PO, 2026-11-25): `origin/dev_v3` · restoring the PO's local checkout stays **OPEN** | — | Harness worktrees are created from `origin/dev_v3` (TD-07), so the local checkout is not needed. Fixing it would change the product repo, which needs a separate approval. |
| D2 | Rotate the committed secrets in both repos and move them out of git (needs the service owners) | PO | **OPEN** | Safe M3; FE edits to env files | The deny and redact controls (04 §4) reduce exposure but don't remove it |
| D3 | Product runtime isolation. Harness side: TD-07. Product side: a product work item to add a local profile without side effects to `furwatch-api` | Architect / PO | **ACCEPTED** (TD-07, Harness side) · **OPEN** (product change) | M6 | Until the product change is decided, the API `run` command stays disabled |
| D4 | Harness technology stack | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-01) | M1 | Install approved by the PO (gate 4, 2026-11-25). **On hold:** replacing the system Node 20 may break `furwatch-app` (Angular 18). The PO must choose an install method. |
| D5 | Model providers, and what product code may be sent to cloud models | PO | **OPEN** (mechanism ACCEPTED in TD-06). The PO asked for an explanation, 2026-11-25 | M3 | No provider credentials are configured (VERIFIED 2026-11-25) |
| D6 | Permission tiers for Harness tools | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-05) | M1 (engine), M3 (tuning) | |
| D7a | Harness layout: a monorepo with `apps/backend`, `apps/frontend`, `packages/shared`, `tests/` | PO | **ACCEPTED** (PO, 2026-11-25) | — | Restated in the PO's blueprint brief |
| D7b | Make `harness/` its own git repository (`git init`) | PO | **ACCEPTED** (PO, 2026-11-25) | — | Local repo only: no remote, no push |
| D8 | Whether native Android/iOS builds are in scope | PO | **OPEN** | FE test scope | JDK and Android SDK are not installed; iOS can't be built on Windows |
| D9 | Command naming: `/fw:*` instead of the built-in `/plan`, `/review` and `/status` | PO | **ACCEPTED** (PO, gate 2, 2026-11-25) | Developer workflow | `docs/standards/agent-design.md` §8 |
| D10 | Contract format in `packages/shared` | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-02) | M1 | Depends on D4 |
| D11 | Monorepo tooling and root layout | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-03) | M1 | Depends on D4 |
| D12 | Backend ↔ frontend transport | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-04) | M1 | |
| D13 | Source of truth: the database for workflow state, Markdown for artifacts, plus an event log | Architect | **ACCEPTED** (PO, gate 2, 2026-11-25) (TD-08) | M1 (schema), M5 | New in v0.2 |
| D14 | Virtual Office rendering technology | Architect / PO | **ACCEPTED** (PO, gate 2, 2026-11-25): DOM/SVG first (TD-11) | M5 | New in v0.2 |
| D15 | Cost policy values: model tier per role, budgets per run and per day, concurrency limits, retention | PO | **OPEN** (values) · mechanism ACCEPTED in TD-09 | M3 | New in v0.2 |
