# WI-001 Design — M1 Harness skeleton
Status: ACCEPTED (gate 2, PO, 2026-11-25)
Author: Architect Agent, 2026-11-25
Inputs: `brief.md` (gate 1 approved, Q1–Q5 defaults accepted)

This design applies the accepted blueprint to M1. It repeats nothing from the blueprint; it only fixes the concrete choices M1 needs.

| Blueprint reference | Topic |
|---|---|
| `docs/architecture/01` §4–6 | Structure |
| `04` §1–6 | Tools and security |
| `05` §1–4 | Data and events |
| TD-01 – TD-05, TD-08 | Accepted decisions this design implements |

Labels: **VERIFIED** (checked on this machine), **DECISION** (a choice made in this design, accepted at gate 2), **UNKNOWN**.

## 1. Facts this design relies on (VERIFIED 2026-11-25)
- Node 24.22.3 (via fnm), pnpm 12.23.0, git 2.55 and Chrome are installed.
- **`node:sqlite` works on Node 24.22.3 without a flag.** It was tested with an in-memory database.
- **ripgrep is not installed.** The earlier "installed" note was wrong and is now corrected in `01` and `08`.

## 2. Two DECISIONS that refine the blueprint (please confirm at gate 2)

| # | Decision | Why | Blueprint impact |
|---|---|---|---|
| **DS-1** | Use **`node:sqlite`** (built into Node) as the SQLite driver. Data access is a thin hand-written layer with SQL migrations, **without Drizzle ORM** for M1. | No native module to compile on Windows, and one dependency fewer. Verified to work. Drizzle's support for `node:sqlite` is UNKNOWN. | TD-01 says "SQLite via Drizzle". DS-1 changes the *driver/ORM* detail only. SQLite and migrations stay. If accepted, TD-01 gets a note. |
| **DS-2** | `search.text` uses **`git grep`** instead of ripgrep | ripgrep isn't installed. `git grep` is, and it supports exclusion pathspecs, which lets secret paths be excluded at the source. | Changes the `01`/`04` tool notes only (already corrected) |

## 3. Workspace layout and scripts (TD-03)
```
harness/
  package.json            # private root; "packageManager": "pnpm@12.23.0"; engines.node "24.22.3"
  pnpm-workspace.yaml     # apps/*, packages/*, tests
  pnpm-lock.yaml          # committed
  tsconfig.base.json      # strict, ES2023, NodeNext/Bundler per package
  biome.json
  scripts/check-boundaries.mjs   # import-boundary check (§9)
  adapters/furwatch-api.yaml, adapters/furwatch-app.yaml
  policy/default.yaml
  packages/shared   -> @harness/shared
  apps/backend      -> @harness/backend
  apps/frontend     -> @harness/frontend
  tests             -> @harness/tests (contract + e2e + fixtures)
```

Root scripts. All are plain `pnpm` commands, so they work unchanged in PowerShell.

| Script | Runs |
|---|---|
| `build` | `pnpm -r build` |
| `typecheck` | `pnpm -r typecheck` |
| `lint` | `biome check .` then `node scripts/check-boundaries.mjs` |
| `test` | `pnpm -r test` (Vitest) |
| `e2e` | `pnpm --filter @harness/tests e2e` (Playwright) |
| `dev` | backend + Vite in parallel |

## 4. Shared contracts (`packages/shared`, TD-02)
- **Error shape:** `{ error: { code, message, details? } }`.
  Codes for M1: `UNAUTHORIZED`, `FORBIDDEN_ORIGIN`, `NOT_FOUND`, `VALIDATION_FAILED`, `TOOL_DENIED`, `INTERNAL`.
- **Event envelope:** as `05` §3.1. The M1 event types are below. They extend the 05 catalog, and the catalog will be updated in the same change.

| Group | Types |
|---|---|
| system | `system.started` |
| project | `project.registered`, `project.status_changed` (available / unavailable + reason), `adapter.rejected` (validation errors) |
| tool | `tool.requested`, `tool.decided` (allow/deny + ruleId), `tool.started`, `tool.finished` |

- **HTTP contracts for M1.** Each contract declares method, path, request schema, response schema and errors.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ status, version, db: "ok" \| "error" }` |
| GET | `/api/projects` | List of `{ id, name, path, baseRef, status, reason?, secretPaths[] }` |
| GET | `/api/events?since=<id>&limit=<n>` | A page of events (JSON) |
| GET | `/api/events/stream` | SSE. Supports `Last-Event-ID` or `?since=` |
| POST | `/api/tools/:tool/invoke` | Internal only (Q2). Body `{ role, projectId, input }` |
| POST | `/api/projects/reload` | Re-reads the adapter files and emits `project.*` / `adapter.rejected` (OQ-4) |

- **OpenAPI:** `openapi.json` is generated from the schemas at build time.

## 5. Backend (`apps/backend`)
Only the M1 subset of the modules in `01` §4 is built: `config`, `store`, `events`, `projects`, `permissions`, `tools`, `api`, `main`.
- **App factory.** `buildApp(config)` returns the HTTP app. Tests call it in-process (contract tests), while `main` binds it to a port.
  - Configuration comes from env: `HARNESS_PORT` (default **7420**) and `HARNESS_HOME` (default `<harness>/.harness`).
  - Tests use a temporary directory as `HARNESS_HOME`.
- **Startup.**
  1. Open `HARNESS_HOME/harness.db` and run pending SQL migrations.
  2. Write a new session token to `HARNESS_HOME/session`.
  3. Load the adapters and policy.
  4. Emit `system.started`.
  5. Listen on `127.0.0.1` only.

### 5.1 Request security (US-3)
- **Token.**
  - It is 32 random bytes, regenerated at every start.
  - Every `/api/*` request must carry `Authorization: Bearer <token>`. The SSE route alone accepts `?token=`, because the browser's EventSource can't send headers.
  - The comparison is constant-time.
  - The token is never logged. The request logger redacts `token` and `Authorization`.
- **Host check.** The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`. Any other host is rejected with 403 `FORBIDDEN_ORIGIN`.
- **Origin check.** If an `Origin` header is present, it must be one of:
  - `http://127.0.0.1:7420` or `http://localhost:7420`;
  - in dev mode only, `http://127.0.0.1:5173` or `http://localhost:5173`.

  Anything else is rejected with 403. No CORS headers are sent to other origins.
- **How the UI gets the token.**
  - In production, the backend serves `index.html` with the token injected as a `<meta>` tag.
  - In dev, a small Vite plugin reads `.harness/session` and injects the same tag.

### 5.2 Store and events (US-4, TD-08)
- **Tables for M1:** `schema_migrations`, `projects`, `events`, `tool_calls`. Only these; the rest of `05` §2 arrives in later milestones.
- **One write path.** `store.transaction(fn)`: state changes and `events.append` happen inside the same SQLite transaction. The event bus is notified only **after commit**.
- **Testing atomicity (AC-4.1).** The store accepts a test-only fault-injection hook that throws between the state write and the event write. The tests then assert that neither row exists.
- **SSE.**
  - The hub sends each committed event to all subscribers.
  - On connect it first replays `events where id > since` from the database, then streams live events.
  - It sends a heartbeat comment every 15 s.
  - Event ids are the database ids, so a replay never sends duplicates.

### 5.3 Project registry (US-5)
`adapters/*.yaml` is validated against a schema from `packages/shared`. Only the M1 fields are used: `id`, `name`, `path` (relative to `harness/`), `baseRef`, `secretPaths[]`, `generated[]`. `commands` is parsed and ignored until M2.

| Case | Result |
|---|---|
| Path missing | Status `unavailable`, with a reason |
| Invalid file | Emits `adapter.rejected` with the validation messages. The other adapters still load. |

The real adapter files contain no secret values, only glob patterns.

### 5.4 Permission engine and tools (US-6, TD-05)
**`policy/default.yaml`**

```yaml
version: 1
rules:            # first match wins, after the fixed checks below
  - id: read-registered-projects
    effect: allow
    roles: [ba, architect, be, fe, tester, release]
    tools: [fs.list, fs.read, search.text, git.log, git.show, git.diff]
```

**Fixed checks** run in code, in this order, before any policy rule. Policy files can't change them.
1. Schema validation of the input.
2. Unknown tool or role → deny.
3. Path normalization (§5.5). If the path escapes the project root → deny.
4. Secret path match (adapter `secretPaths` + the global list from `security-policy.md` §1) → deny.
5. Any write tool → deny. M1 has no write tools, and writes to `policy/**` are always denied.

**Tools in M1** (all risk class `read`):

| Tool | Behaviour |
|---|---|
| `fs.list` | Lists a directory |
| `fs.read` | Reads a file. Line ranges supported; maximum 256 KB per call |
| `search.text` | `git grep -n -I --untracked -e <pattern> -- . ':(exclude)<secret globs>'` |
| `git.log` | Messages, authors and dates only. **No `-p`.** |
| `git.show <ref>:<path>` | The path is checked like `fs.read` |
| `git.diff` | Runs `git diff --name-only` first. If any changed path is secret, or no paths were given, the result is the `--stat` list only, with `:(exclude)` pathspecs for secret globs. Content is returned only for non-secret paths. |

All processes start from an argv array with `shell: false`, run with `cwd` = the project root, and have a timeout.

**Redaction.**
- Every tool output, and every event payload, passes through the redactor before it is stored or returned.
- Patterns:
  - connection strings: `Server=`, `Data Source=`, `Password=`, `AccountKey=`;
  - `-----BEGIN … PRIVATE KEY-----` blocks;
  - JWT-shaped tokens;
  - common API-key prefixes;
  - values of keys whose name contains password, secret, token or apikey.
- Matched values are replaced with `«redacted:<kind>»`.

**Audit.** Every call writes a `tool_calls` row and the four `tool.*` events. The decision event carries the `ruleId`.

### 5.5 Path normalization on Windows
1. Resolve the path against the project root.
2. Run `realpath` on it. This resolves symlinks and junctions.
3. Compare to the root case-insensitively, using forward slashes.
4. Reject:
   - anything outside the root;
   - device paths (`\\?\`, `\\.\`);
   - alternate data streams (`file:stream`);
   - absolute paths on a different drive.

Glob matching for `secretPaths` is also case-insensitive.

## 6. Frontend (`apps/frontend`, US-7)
- **Stack:** React + Vite + TanStack Query. There are two views (Projects, Timeline) behind simple in-app tabs. **No router library in M1**; one is chosen when M3 needs it.
- **Data:**
  - `api/` holds a typed fetch client built from the `@harness/shared` contracts, and attaches the token from the `<meta>` tag.
  - Timeline uses one `EventSource` on `/api/events/stream?token=…`. The browser reconnects automatically and resends `Last-Event-ID`.
  - The Projects view refetches when a `project.*` event arrives.
- **Errors:** shown through the shared error shape. The `code` is visible.

## 7. Fixtures and tests (`tests/`)
- **Fixture repos are generated at test time** in a temporary directory. A script runs `git init`, writes files, and commits. No nested `.git` is committed.
- **Fixture contents:**
  - fake secrets (`appsettings.Development.json` with `Password=FAKE-DO-NOT-USE`, a fake PEM block);
  - normal source files;
  - a junction that points outside the root.
- **Contract tests** (Vitest + `buildApp` in-process): every route and SSE event is validated against the shared schemas.
- **E2E tests** (Playwright with `channel: "chrome"`, decided in Q4):
  - start the real backend on a random free port, with a temporary `HARNESS_HOME` and fixture adapters;
  - drive the Projects and Timeline views.
- **The real product repos are not read by tests (Q5).** One test only checks that the two real adapter files validate and that their `path` exists.

## 8. Packages to approve at gate 3 (gate 4 install)
The final list goes in `plan.md`. Each package is named for its purpose (TD-01/03). Versions are fixed in the lockfile at install time.

| Area | Packages |
|---|---|
| Common | `typescript`, `@biomejs/biome`, `vitest`, `zod`, a Zod-to-OpenAPI generator, `yaml` |
| Backend | `fastify` |
| Frontend | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `@tanstack/react-query` |
| Tests | `@playwright/test` (no browser download; uses the installed Chrome) |

Not needed thanks to DS-1 and DS-2: Drizzle, `better-sqlite3`, ripgrep.

## 9. Import boundaries (AC-1.3)
- **Package imports are blocked by declaration.** The workspace `package.json` files never declare the other app as a dependency, so a package import across apps fails type-checking.
- **Relative-path imports are caught by `scripts/check-boundaries.mjs`.** It scans `apps/backend` and `apps/frontend` for imports that resolve into the other app, and exits with code 1 listing each offending import. It is dependency-free and deterministic. A Biome built-in rule would be preferred if one is confirmed to fit; that is UNKNOWN today.

## 10. Risks
| Risk | Mitigation |
|---|---|
| `node:sqlite` API is still marked experimental upstream (UNKNOWN for 24.x) | Wrap it in `store`. Can switch to `better-sqlite3` later, and only `store` changes. |
| pnpm 12 is new | If tooling breaks, pin an earlier pnpm (PO approval) |
| The redactor misses a secret format | Deny secret paths first, redact second. D2 (rotation) is the real fix. |
| `git diff` / `git show` leaking secret content | Pathspec exclusion plus the pre-check in §5.4. Covered by dedicated tests. |

## 11. Answers to the Tester's open questions (`test-cases.md`, OQ-1 to OQ-19)
These answers are part of this design.

| OQ | Decision |
|---|---|
| 1 | Tests read the token from `HARNESS_HOME/session`. The SSE route takes it as `?token=`; every other route takes it in the `Authorization` header. |
| 2 | Configuration comes from environment variables: `HARNESS_PORT` (`0` lets the OS pick a port; the real port and the pid are written to `HARNESS_HOME/runtime.json`), `HARNESS_HOME`, `HARNESS_ADAPTERS_DIR` and `HARNESS_POLICY_DIR`. Logs go to `HARNESS_HOME/logs/`. |
| 3 | `store` has a fault hook (`afterStateWrite` or `beforeCommit`). It is accepted **only when `NODE_ENV=test`** and ignored otherwise. A unit test proves it has no effect outside tests. |
| 4 | Tests create events on demand in two ways: by calling the internal tool endpoint (which emits `tool.*` events), or by calling a new route, **`POST /api/projects/reload`**, which re-reads the adapter files and emits `project.*` / `adapter.rejected`. The route is added to the shared contracts. |
| 5 | Latency is measured from the moment the trigger request is sent (T0). The requirement is: the worst of 20 events arrives in under 1 s. The SSE response is not compressed and each event is flushed immediately. |
| 6 | Resume uses `Last-Event-ID` if present, otherwise `since`. An id above the current maximum means no replay, only live events. A non-numeric id returns 400 `VALIDATION_FAILED`. **Ids can have gaps** (SQLite AUTOINCREMENT), so clients must rely on order only, not on consecutive numbers. |
| 7 | **The token is kept across restarts.** It is reused from `HARNESS_HOME/session` when that file exists, and a new one is created only when the file is missing, so an open page keeps working after a restart. Deleting the file rotates the token. Each restart emits `system.started`, plus `project.*` events only for changes. The missed events checked by AC-7.3 are the ones produced after the restart, for example `system.started` and a reload. |
| 8 | If the database is unavailable, health returns **503** with `{ status: "degraded", db: "error", version }`, in the health response shape, not the error shape. |
| 9 | Checks run in this order: **Host → Origin → token**. A request with a bad Origin and a bad token therefore gets 403. Only `GET /` and the static UI assets are served without a token; **`/api/health` needs the token**. Allowed Origins: `http://127.0.0.1:7420`, `http://localhost:7420`, and in dev mode `:5173` on both hosts. Allowed Host values: `127.0.0.1:<port>` and `localhost:<port>`. `OPTIONS` (CORS preflight) is not supported: 403 for foreign origins. The dev setup uses Vite's same-origin proxy, so it needs no preflight. |
| 10 | `fs.list` shows secret files **by name**, marked `secret: true`. Their contents can never be read. `search.text` skips secret paths at the source and reports `excludedSecretPaths: <count>`. |
| 11 | A git call with mixed or whole-repo scope is **filtered, not denied**. Non-secret content is returned, and secret files appear in `withheld[]` as name and stats only. The decision event is `allow` with `filtered: true`. A bare `git show <blob-sha>` is **denied**, because it can't be mapped to a path; use `<ref>:<path>` instead. `git show <commit>` is filtered the same way as a diff. |
| 12 | Paths are resolved to their real location first and then checked, so junctions and symlinks that stay inside the root are allowed. Short names are expanded by the native real-path call. **Denied:** alternate data streams, device paths, and any path segment that ends in a dot or a space. |
| 13 | The schema checks the role only as a string. Whether the role is valid is decided by the permission engine, so an unknown role produces a `tool.decided` deny. Rule id formats: `fixed:<check>` (for example `fixed:secret-path`, `fixed:unknown-role`) and `policy:<id>`. |
| 14 | The redaction marker is `«redacted:<kind>»`. Logs are JSON lines in `HARNESS_HOME/logs/backend.log`. Tool logs record the name, decision, sizes and duration, **never the content**. `tool_calls` stores the redacted arguments and a redacted output preview of at most 4 KB. |
| 15 | **AC-2.1 is enforced through a route registry.** Every backend route is registered from a contract object exported by `@harness/shared`. A test asserts two things: every registered route comes from a shared contract, and every shared contract has a route. The frontend client is generic over the same contract objects. Review covers anything these checks don't. |
| 16 | Yes. The contract assertion helper is a pure function, so it is unit-tested with recorded bad responses. That is how the negative case of AC-2.3 is covered. |
| 17 | `scripts/check-boundaries.mjs` covers both relative paths and package names (`@harness/frontend` used from the backend, and the reverse). Its message has the form `file:line imports <spec> → crosses apps/backend ⇄ apps/frontend`. |
| 18 | `pnpm install --frozen-lockfile` uses the online registry. Without network, TC-01 is reported as **SKIPPED with a reason**, never as PASS. |
| 19 | AC-5.4 shows the **adapter's list only**. The global list stays in `security-policy.md` §1 and the engine applies it, but M1 does not show it in the UI or the API. |
