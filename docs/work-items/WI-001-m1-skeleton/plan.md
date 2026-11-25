# WI-001 Plan
Status: Execution — gate 3 approved (PO, 2026-11-25). T1 done, T2 in progress

- **Gate 2:** approved on 2026-11-25.
- **PO direction, 2026-11-25:** build the structure now; tests are deferred.

Owners follow `docs/standards/agent-design.md` §2.1.
Branch names use the form `fw/WI-001-Tn-<slug>`.
Evidence commands are listed in `backend-standards.md` §4 and `frontend-standards.md` §4. The Harness-specific evidence commands will be set when T2 is done.

| ID | Owner | Area | Summary | Depends on | Covers AC | Done when |
|---|---|---|---|---|---|---|
| **T1** | Orchestrator | root, all `apps/*`, `packages/shared`, `tests`, `adapters/`, `policy/` | **Structure scaffold.** Folders, `package.json` / `tsconfig` per package, root workspace config, placeholder modules matching design §3–§7, adapter and policy files. No dependencies are installed and there is no application logic. | — | (enables all) | Every config file parses (JSON/YAML). The layout matches design §3. Nothing is installed. The product repos are untouched. |
| T2 | Orchestrator | root | Install the approved packages (design §8) with pnpm and commit the lockfile. Add the boundary check script (design §9). | T1, **gate 3 + gate-4 install approval** | 1.1, 1.3 | `pnpm install --frozen-lockfile` succeeds. `build`, `typecheck` and `lint` pass on the scaffold. |
| T3 | BE (contract task) | `packages/shared` | Error shape, event envelope and M1 event types, the HTTP contracts (design §4 + the reload route), adapter/policy schemas, OpenAPI generation | T2 | 2.1, 2.2 | Shared builds. OpenAPI is generated. The contract is frozen after the handoff is accepted. |
| T4 | BE | `apps/backend` | config, store (`node:sqlite`, migrations, transaction + fault hook), events + SSE hub | T3 | 4.1–4.4 | Backend builds. Manual smoke test of the stream. |
| T5 | BE | `apps/backend` | api: app factory, token / Host / Origin checks, health route | T4 | 3.1–3.4 | Manual smoke test with and without the token |
| T6 | BE | `apps/backend` | Project registry from adapters, plus the reload route | T4, T5 | 5.1–5.4 | Projects list shows both products |
| T7 | BE | `apps/backend` | Permission engine, path normalization, redactor, the 6 read-only tools, audit | T5, T6 | 6.1–6.6 | Manual check: a secret path is denied, with a deny event |
| T8 | FE | `apps/frontend` | Shell, typed client, Projects and Timeline views, SSE reconnect | T3 (mocks), T5–T6 (integration) | 7.1–7.3 | UI shows projects and live events from the local backend |
| T9 | Tester | `tests/`, test files in the apps | **Deferred by the PO.** Implement TC-01…TC-41 (`test-cases.md`) | T2–T8 | all | All TCs pass, or are reported SKIPPED with a reason |
| T10 | Release Manager | — | Release review of WI-001 | T9 | — | `release-review.md` with a GO / NO-GO recommendation |

## Approvals required during execution
- **T2:** install the packages listed in design §8. This is gate 4; the exact package list is shown before installing.
- **T4–T8:** none beyond the plan. Everything stays local, makes no LLM calls and doesn't touch the product repos.

## Risks / assumptions
- With tests deferred (T9), T4–T8 are checked only by build and manual smoke tests. M1's acceptance criteria stay **unverified** until T9 is done, and a release review (T10) can't recommend GO before then.
- pnpm 12 and the stability of `node:sqlite`: see design §10.

## AC coverage check
Every AC from 1.1 to 7.3 is mapped to T2–T8 for implementation and to T9 for verification.

## Progress
- **T1 done (2026-11-25).**
  - 35 files created: root config, the 4 packages with placeholder modules, adapters and policy.
  - Every JSON/YAML file parses.
  - Nothing is installed, so `build`/`typecheck` can't run until T2.
  - The product repos are untouched.
- **Gate 3 + T2 install (gate 4): approved by the PO in chat on 2026-11-25** ("OK làm đi").
  - Packages: the design §8 list, **without** `vitest` and `@playwright/test`, which are deferred to T9 along with the tests.
  - Type packages that the TypeScript build needs (`@types/node`, `@types/react`, `@types/react-dom`) are added and reported in the T2 result.
