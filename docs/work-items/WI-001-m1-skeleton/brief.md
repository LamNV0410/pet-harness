# WI-001 M1 — Harness skeleton (safety backbone)
Status: Planning — Structure scaffold in progress (gate 2 approved)

## Goal
The PO gets a running local Harness that can show the managed projects and a live activity stream. It enforces the security rules (secret files can never be read, every action is audited) **before** any AI agent is connected.

- **Affects:** the Harness itself (`apps/backend`, `apps/frontend`, `packages/shared`, `tests/`).
- **Does not touch:** the product repositories. They are read-only, and the Harness only registers their paths.
- **User roles:**
  - PO, using the browser UI;
  - Orchestrator, Tester and BE/FE agents, using workspace commands.

Source: roadmap `docs/architecture/07-implementation-roadmap.md` §2 (M1), accepted at gate 2 on 2026-11-25.

## Current behaviour
- **VERIFIED, repository state.** `harness/` is a git repo with documentation only. `apps/backend`, `apps/frontend`, `packages/shared` and `tests` contain only a README. There is no `package.json` and no lockfile.
- **VERIFIED, toolchain.**
  - Node 24.22.3 is installed through fnm and pinned in `.node-version`.
  - pnpm 12.23.0 is available on that Node.
  - The system Node is still 20.20.1.
  - Chrome is installed.
- **VERIFIED, architecture.** The design to follow is already decided:
  - TD-01: stack;
  - TD-02: contracts;
  - TD-03: tooling and layout;
  - TD-04: HTTP + SSE;
  - TD-05: permissions;
  - TD-08: state + events.

  The documents that describe it are `01` §4–6, `04` §1–6 and `05` §1–4.
- **UNKNOWN.** Whether the native SQLite driver installs cleanly on this machine. TD-01 names a fallback.

## Questions for PO

| # | Question | Why it matters | Proposed default |
|---|---|---|---|
| Q1 | Which local ports should the Harness use? | Must not clash with furwatch-api (7149) or furwatch-app (4200). | Backend **7420**. Frontend dev server **5173**. In normal use the backend also serves the built UI on 7420. |
| Q2 | How can read-only tools be used in M1, before agents exist? | Decides whether M1 needs extra UI. | Tools are reachable only through tests and an internal API call. There is **no tool UI** in M1. |
| Q3 | Approve the dependency set for M1 as one gate-4 approval when the plan is approved (gate 3)? | `CLAUDE.md` gate 4: installing packages needs approval. | **Yes.** The plan will list the exact packages. They come from TD-01/02/03: backend framework, validation, SQLite + ORM + migrations, YAML parser, React + Vite + query library, test runners, Biome, TypeScript. |
| Q4 | Should Playwright use the installed Chrome instead of downloading its own browsers? | Avoids a large download and an extra install. | **Yes**, use the installed Chrome. |
| Q5 | Should M1 tests read the real product repos? | The product repos contain committed secrets (`discovery/backend.md` §8). | **No.** Tests use small fixture repos with fake secrets. The real repos are only registered: path and base ref, checked with a single existence test. |

## User stories and acceptance criteria

### US-1 One-command workspace
As the Orchestrator, I want to install, build, check and test the whole Harness with single commands, so that every agent and the PO get the same, reproducible result.
- **AC-1.1** Given a clean clone on Node 24.22.3, when the frozen-lockfile install runs, then it succeeds and creates no lockfile changes.
- **AC-1.2** Given the workspace, when build, lint, type-check and test run across all packages, then all of them pass.
- **AC-1.3 (negative)** Given code in the backend that imports from the frontend, or the reverse, when lint runs, then lint fails and names the forbidden import.
- **AC-1.4 (negative)** Given files under `.harness/`, when `git status` runs, then those files are not listed.

### US-2 Shared contracts
As the BE and FE agents, I want the error shape, the event envelope and the first API contracts defined once in the shared package, so that the backend and frontend can't drift apart.
- **AC-2.1** Given the shared package, when the backend and frontend are type-checked, then both use the shared definitions for health, projects, events and errors. Neither app redefines them.
- **AC-2.2** Given the shared package, when it is built, then an OpenAPI document is generated from the contracts.
- **AC-2.3 (negative)** Given a backend response that doesn't match its contract, when the contract tests run, then they fail.

### US-3 Secure local backend
As the PO, I want the Harness backend to run only on my machine and reject anything that isn't my own browser session, so that other programs and web pages can't control it.
- **AC-3.1** Given the backend is started, when its network listeners are inspected, then it listens on 127.0.0.1 only.
- **AC-3.2** Given a request without the session token, or with a wrong token, when it reaches any API route, then it is rejected with 401 and the standard error shape.
- **AC-3.3 (negative)** Given a request with a foreign `Origin` or `Host` header, when it arrives, then it is rejected with 403.
- **AC-3.4** Given a valid session, when the health endpoint is called, then it reports that the service and the database are OK, plus the Harness version.

### US-4 Durable activity stream
As the PO, I want every state change recorded as an event and streamed live to my browser, so that I can see what happened and nothing is lost when I reconnect.
- **AC-4.1** Given any state change (for example, a project registered), when it is saved, then the state and its event are stored together. A forced failure in between leaves neither.
- **AC-4.2** Given an open live stream, when a new event is stored, then the browser receives it in under 1 second.
- **AC-4.3** Given a client that disconnected after event N, when it reconnects and passes the last event id, then it receives exactly the events after N, in order, with no duplicates.
- **AC-4.4** Given the backend is restarted, when the stream is opened again, then earlier events are still available.

### US-5 Project registry
As the PO, I want furwatch-api and furwatch-app registered from their adapter files, so that the Harness knows where the products are and which base branch to use.
- **AC-5.1** Given the two adapter files, when the backend starts, then the projects list shows `furwatch-api` (base `dev_v3`) and `furwatch-app` (base `origin/dev_v3`, decision D1).
- **AC-5.2 (edge)** Given an adapter whose path doesn't exist, when the backend starts, then the project is listed as "unavailable" with a reason, and the backend still starts.
- **AC-5.3 (negative)** Given an invalid adapter file, when the backend starts, then that adapter is rejected with a clear validation message, and the other projects still load.
- **AC-5.4** Given a registered project, when its secret-path list is viewed, then it matches the adapter file. No secret values are shown.

### US-6 Read-only tools behind the permission engine
As the PO, I want every tool call checked by one permission engine before it runs, so that no current or future agent can read secrets or act outside its scope.
- **AC-6.1** Given a fixture project, when a role with read access lists files, reads a non-secret file or searches text, then the call succeeds. A `tool.decided` (allow) event and a `tool.finished` event are recorded.
- **AC-6.2 (negative)** Given a path that matches the project's secret paths, when it is read directly or through git (show or diff), then the call is **denied**. A `tool.decided` (deny) event names the rule, and the secret's content appears nowhere: not in the response, the events or the logs.
- **AC-6.3 (negative)** Given a path outside the project root (for example `..\..\`), when a read is attempted, then it is denied.
- **AC-6.4 (negative)** Given an unknown tool name, or an unknown role, when it is called, then it is denied by default.
- **AC-6.5** Given a fixture file containing a fake connection string and a fake private key, when it is read through an allowed path, then those values are redacted in the result and in the stored events.
- **AC-6.6** Given the policy files, when any tool tries to write to them, then the write is denied. In M1 every write is denied, because write tools arrive in M4.

### US-7 Minimal UI
As the PO, I want to open the Harness in my browser and see the projects and a live timeline, so that I can confirm the backbone works.
- **AC-7.1** Given the backend is running, when the PO opens the Harness URL, then the Projects view lists both products with base branch and availability.
- **AC-7.2** Given the Timeline view is open, when a new event occurs, then it appears without a page reload.
- **AC-7.3 (edge)** Given the backend is stopped and then started again, when the Timeline is open, then it reconnects by itself and shows any events it missed.

## Non-functional notes and risks
- **Platform.** Windows 11 with Node 24.22.3 via fnm. Product tooling keeps the system Node 20. All scripts must work in PowerShell; no `VAR=x cmd` syntax.
- **No model calls.** M1 makes no LLM calls, so it costs no subscription quota.
- **No product writes.** Nothing is written to `../furwatch-api` or `../furwatch-app`. Tests use fixture repos only (Q5).
- **Secrets.** Real secret values must never appear in fixtures, code, events or logs. Fixtures use clearly fake values.
- **RISK: native SQLite driver.** The driver may not install on Windows. The fallback is in TD-01. The Architect checks this first in planning.
- **RISK: pnpm 12.** pnpm 12 is a new major version. If it causes tooling problems, pin an earlier version, which needs PO approval.
- **No i18n.** The Harness UI is English-only in M1; no requirement says otherwise.

## Out of scope
Agents and LLM use, `cmd.run`/build execution (M2), worktrees and write tools (M2/M4), Approval Center, Requirement Inbox, Kanban, agent dashboard and Virtual Office (M3/M5), running product servers (M6), CI pipeline configuration.

## Approvals
- **Gate 1:** approved by the PO in chat on 2026-11-25. The proposed defaults for Q1–Q5 are accepted:
  - backend on 7420, UI dev server on 5173;
  - no tool UI in M1;
  - packages approved once, together with the plan at gate 3;
  - Playwright uses the installed Chrome;
  - tests use fixture repos only.
- **Gate 2:** approved by the PO in chat on 2026-11-25. This covers `design.md` (including DS-1 `node:sqlite` and DS-2 `git grep`) and `test-cases.md`.
- **PO direction, 2026-11-25:** "don't test now; only build the structure for the next tasks".
  - Implementing the tests is **deferred**. The test cases stay as the target for later tasks.
  - The current step only creates the workspace structure: folders, config files and placeholders.
  - No packages are installed and no application logic is written.
  - Until the deferred test tasks are done, M1's acceptance criteria are **not verified**.
