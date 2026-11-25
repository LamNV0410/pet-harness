# WI-001 Plan
Status: Merged to main (PO, 2026-11-25). T9 tests and T10 release review NOT done

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
- **T2 done (2026-11-25)** on branch `fw/WI-001-T2-install`, with Node 24.22.3 and pnpm 12.23.0.
  - **Packages installed**, with versions locked in `pnpm-lock.yaml`:

    | Package | Version | Where |
    |---|---|---|
    | typescript | 7.0.2 | root |
    | @biomejs/biome | 2.6.9 | root |
    | zod | 4.6.7 | shared |
    | fastify | 5.12.8 | backend |
    | yaml | 2.9.1 | backend |
    | @types/node | 24.19.2 | backend |
    | react, react-dom | 19.3.1 | frontend |
    | @tanstack/react-query | 5.108.4 | frontend |
    | vite | 8.3.8 | frontend |
    | @vitejs/plugin-react | 6.3.0 | frontend |
    | @types/react, @types/react-dom | 19.3.0 | frontend |

  - **No Zod-to-OpenAPI library was needed.** Zod 4 has built-in JSON Schema output, so that item of design §8 was dropped (one dependency fewer).
  - **Added:**
    - `scripts/check-boundaries.mjs`. A quick probe confirmed it catches both a relative-path import and a package-name import (exit 1).
    - `apps/frontend/vite.config.ts`.
    - Biome config. It covers code and config only and leaves Markdown, `docs/` and `.claude/` alone.
  - **Evidence:** `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck` and `pnpm lint` all exit 0. `pnpm test` only prints that tests are deferred to T9.
  - **Notes:**
    - **TypeScript 7.0.2** is the latest release (the new native compiler). It works for build and typecheck so far. If a tool turns out to be incompatible, pinning TypeScript 5.x needs PO approval.
    - **pnpm package store.** pnpm keeps its package store at `D:\.pnpm-store`, which is pnpm's default location on that drive.
- **T3–T8 done (2026-11-25)** on branch `fw/WI-001-T3-T8`. It is one branch with one commit per task group, instead of one branch per task (an Orchestrator simplification, since the work was sequential).

  | Task | Commit | Scope |
  |---|---|---|
  | T3 | `74f3131` | Shared contracts |
  | T4–T7 | `1fc38c1` | Backend |
  | T8 | (this commit) | Frontend |

  - **Evidence:** `pnpm build`, `pnpm typecheck` and `pnpm lint` all exit 0. One Biome warning remains (CSS selector order).
  - **Manual smoke test**, backend on a temporary `HARNESS_HOME`, real adapters:
    - **Access:** no token → 401. Foreign Origin → 403. Health returns 200 `{status: ok, db: ok}`.
    - **Projects:** both are available.
    - **Denied as expected:**
      - `fs.read` and `git.show` of `appsettings*.json` → 403 `fixed:secret-path`;
      - path traversal → 403 `fixed:path-escape`;
      - alternate data stream → 403 `fixed:path-invalid`;
      - unknown tool or role → 403;
      - bare `git.show` → 403 `fixed:bare-object`.
    - **Allowed:** `fs.list` returns 200. `search.text` returns 200 with 8 secret paths excluded, and no secret file appears in the results.
    - **Event stream:** the event arrives in about 230 ms.
    - **No raw secrets stored:** neither the DB nor the log contains a raw `Password=` value.
  - **UI:** checked in the browser pane at `http://127.0.0.1:7420`. Projects lists both products. The Timeline shows live allow and deny events.
  - **Not verified:** the acceptance criteria have no automated tests (T9 is deferred), and AC-7.3 (auto-reconnect after a restart) has not been checked by hand.
- **Merged to `main` (fast-forward to `c950911`) on the PO's direct instruction, 2026-11-25** ("Merge vào main rồi làm M2").
  - This counts as the gate-4 approval for this merge.
  - The **T10 release review (`release-review` skill) was not run**. T9 tests are still deferred.
  - WI-001's acceptance criteria are therefore smoke-tested only.
  - The `/fw:*` commands and skills were not available in this session, because it was opened at the `Furwatch/` root rather than in `harness/`.
