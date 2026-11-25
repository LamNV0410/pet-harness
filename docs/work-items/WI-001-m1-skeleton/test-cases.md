# WI-001 Test Cases
Status: ACCEPTED (gate 2, PO, 2026-11-25). Implementation deferred by the PO
Author: Tester Agent · Date: 2026-11-25
Input: `brief.md` (gate 1 approved, Q1–Q5 defaults accepted). Context: `docs/standards/contracts.md` §3, `security-policy.md` §1–2, `tests/README.md`, `docs/architecture/04` §2–6, `05` §1–4.

The technical design for WI-001 is being written in parallel. Tests are therefore described by **observable behaviour**: HTTP status, response shape, recorded events, visible UI state and files on disk. Endpoint paths, class names, table names and library APIs are left to the design. Where a test needs a design decision, it points to an open question (OQ-n) at the end of this file.

Levels:
- **unit**: inside one app, no process boundary.
- **contract**: `tests/contract/`; real backend response checked against `packages/shared`.
- **integration**: real backend process on a temp data directory, driven over HTTP/SSE or by a workspace script.
- **e2e**: Playwright with installed Chrome against the backend-served UI.
- **manual**: none planned. Every AC has an automated case.

Fixtures are referenced as `FX-n` (see "Fixtures"). "Canary" means one of the unique fake-secret strings in FX-2; "canary sweep" means searching for every canary in the named outputs and expecting zero hits.

## Coverage

| AC | Test cases |
|---|---|
| AC-1.1 | TC-01 |
| AC-1.2 | TC-02 |
| AC-1.3 | TC-03, TC-04 |
| AC-1.4 | TC-05 |
| AC-2.1 | TC-06 |
| AC-2.2 | TC-07 |
| AC-2.3 | TC-08, TC-09 |
| AC-3.1 | TC-10 |
| AC-3.2 | TC-11, TC-12 |
| AC-3.3 | TC-13 |
| AC-3.4 | TC-14 |
| AC-4.1 | TC-15, TC-16 |
| AC-4.2 | TC-17 |
| AC-4.3 | TC-18, TC-19 |
| AC-4.4 | TC-20 |
| AC-5.1 | TC-21 |
| AC-5.2 | TC-22 |
| AC-5.3 | TC-23 |
| AC-5.4 | TC-24 |
| AC-6.1 | TC-25, TC-26 |
| AC-6.2 | TC-27, TC-28, TC-29, TC-30, TC-31, TC-38 |
| AC-6.3 | TC-32, TC-33 |
| AC-6.4 | TC-34 |
| AC-6.5 | TC-35, TC-36, TC-38 |
| AC-6.6 | TC-37 |
| AC-7.1 | TC-39 |
| AC-7.2 | TC-40 |
| AC-7.3 | TC-41 |

## Test cases

### US-1 One-command workspace

**TC-01 Clean clone installs with frozen lockfile and changes nothing**
- AC: 1.1 · Level: integration (PowerShell workspace script) · Negative/edge: no
- Preconditions: Node 24.22.3 active via fnm (`.node-version`); pnpm 12.23.0; the gate-4 approved packages are reachable from the registry or the local pnpm store.
- Steps:
  1. `git clone` the Harness repo (the branch under test) into a new temp directory.
  2. In that directory, check `node --version` and `pnpm --version`.
  3. Run the frozen-lockfile install.
  4. Run `git status --porcelain`.
- Expected: the versions match the pins; the install exits 0; `git status --porcelain` is empty (no lockfile or other tracked-file change).

**TC-02 Build, lint, type-check and test pass across the workspace**
- AC: 1.2 · Level: integration (workspace script) · Negative/edge: no
- Preconditions: TC-01 state.
- Steps: run the workspace-level build, lint, type-check and test commands, one after another, from the repo root in PowerShell.
- Expected: each command exits 0 and covers `apps/backend`, `apps/frontend` and `packages/shared` (the output names all three). No command uses `VAR=x cmd` syntax.

**TC-03 Lint rejects backend importing frontend**
- AC: 1.3 · Level: integration (lint run on a scratch copy) · Negative/edge: negative
- Preconditions: a temp copy or temp git worktree of the repo (never the working tree under review).
- Steps:
  1. Add one temporary source file in the backend that imports a module from the frontend, once by relative path and once by package name.
  2. Run lint.
- Expected: lint exits non-zero, and the output names the offending file and the forbidden import. After the file is removed, lint passes again (control).

**TC-04 Lint rejects frontend importing backend**
- AC: 1.3 · Level: integration · Negative/edge: negative
- Same as TC-03, in the other direction (frontend file imports from the backend). Expected: same.

**TC-05 Files under `.harness/` are not tracked**
- AC: 1.4 · Level: integration (script) · Negative/edge: negative
- Preconditions: a clean clone (TC-01).
- Steps:
  1. Create `.harness/session`, `.harness/env/dev.env`, `.harness/logs/x.log`, `.harness/data/x.db` and `.harness/nested/deep/file.txt`.
  2. Run `git status --porcelain` and `git check-ignore -v` on each file.
- Expected: no `.harness/` path appears in `git status`. `check-ignore` matches every file to a rule in the tracked `.gitignore`.

### US-2 Shared contracts

**TC-06 Apps use shared definitions and do not redefine them**
- AC: 2.1 · Level: unit (static check, run with lint or test) · Negative/edge: includes a negative control
- Preconditions: the shared package exports health, project, event-envelope and error definitions (names from the design).
- Steps:
  1. Type-check both apps.
  2. Run a static check: for each shared contract name, confirm that the backend and frontend import it from the shared package, and that neither app declares a type, interface or schema with that name.
  3. Negative control on a scratch copy: add a local redeclaration of the error shape in the frontend, then rerun the check.
- Expected: steps 1–2 pass. Step 3 fails and names the file. The mechanism is OQ-15.

**TC-07 Building the shared package generates an OpenAPI document**
- AC: 2.2 · Level: integration (build script + document validation) · Negative/edge: no
- Steps:
  1. Delete any previous generated document.
  2. Build the shared package.
  3. Parse the generated document and validate it against the OpenAPI 3.x schema.
- Expected: the file exists and is valid. It declares the health, projects and events operations, the standard error schema, and the 401/403 responses. Building twice produces byte-identical output (deterministic).

**TC-08 Contract tests: every M1 endpoint matches its shared contract**
- AC: 2.3 (positive side), supports 3.2–3.4, 5.1 · Level: contract · Negative/edge: no
- Preconditions: backend started on a temp data dir with FX-3 adapters; session token available (OQ-1).
- Steps: for each operation in the OpenAPI document, call it with valid input, and with input that produces each documented error status. Validate every response body and status against the shared schema.
- Expected: all responses validate. Every error response uses the single error shape.

**TC-09 Contract tests fail on a non-conforming response**
- AC: 2.3 · Level: contract (meta-test) · Negative/edge: negative
- Preconditions: a way to serve a deliberately wrong response to the contract-test runner, for example a stub server or a recorded fixture response (OQ-16).
- Steps: run the contract-test assertion against responses that (a) miss a required field, (b) have a wrong field type, (c) use an undocumented status code, and (d) have an error body that is not the standard shape.
- Expected: each of the four runs fails and names the field or status.

### US-3 Secure local backend

**TC-10 Backend listens on 127.0.0.1 only**
- AC: 3.1 · Level: integration · Negative/edge: includes a negative
- Steps:
  1. Start the backend.
  2. List its listening sockets with `Get-NetTCPConnection -State Listen -OwningProcess <pid>`.
  3. Try to connect to the same port on the machine's non-loopback IPv4 address, on `0.0.0.0`, and on `[::1]`.
- Expected: every listener's local address is `127.0.0.1`. The connections in step 3 are refused. The SSE stream does not use a separate listener; if it does, that listener is also `127.0.0.1` only.

**TC-11 Missing or wrong token gives 401 on every API route**
- AC: 3.2 · Level: integration (parametrised over the route list from the OpenAPI document, including the event stream) · Negative/edge: negative
- Steps: for each route, send a request (a) with no auth header, (b) with an empty bearer value, (c) with a wrong token of the right length, (d) with the right token in a different case, (e) with the token in a non-bearer scheme or query string (unless the design allows a query token for SSE; OQ-1), and (f) with the token from a previous backend start.
- Expected: 401 with a body matching the shared error shape. No route returns data. No event other than an optional audit event is recorded, and the response contains no token value.

**TC-12 Valid token is accepted (positive control for 401)**
- AC: 3.2 · Level: integration · Negative/edge: no
- Steps: call each route with the current token and an allowed Origin and Host.
- Expected: the route's documented success status. This proves the 401s in TC-11 come from the token check and not from a broken route.

**TC-13 Foreign Origin or Host is rejected with 403**
- AC: 3.3 · Level: integration · Negative/edge: negative
- Steps: with a **valid** token, send requests with:
  - `Origin` set to `http://evil.example`, `http://localhost:4200`, `http://127.0.0.1:7149`, `null`, and `http://127.0.0.1:7420.evil.example`;
  - `Host` set to `evil.example:7420`, `127.0.0.1.nip.io:7420` (DNS rebinding), `localhost:9999`, and an empty value.
  
  Repeat the requests on the event stream.
- Expected: 403 with the standard error shape. Allowed origins (`http://127.0.0.1:7420`, `http://localhost:7420` and the dev server on 5173, per the design) succeed. Precedence when both the token and the Origin are bad is OQ-9.

**TC-14 Health reports service, database and version**
- AC: 3.4 · Level: contract + integration · Negative/edge: edge (database down)
- Steps:
  1. Call health with a valid session.
  2. Edge: make the database unusable (for example, lock or remove the data file under the temp data dir) and call health again.
- Expected:
  1. Success status; the body says the service is OK and the database is OK, and includes a version equal to the Harness package version.
  2. The body reports the database as not OK, as decided in OQ-8; the response still matches the contract.

### US-4 Durable activity stream

**TC-15 State change and its event are stored together**
- AC: 4.1 · Level: integration (backend unit-level store test is acceptable if it uses the real database driver) · Negative/edge: no
- Steps: perform a state change (for example, registering the FX-3 fixture project at startup, or another trigger per OQ-4). Read the state through the API and read the events.
- Expected: the state is visible. Exactly one matching event exists, with an `id` greater than every earlier event, an ISO-8601 `ts`, a `type`, an `actor` and a `correlationId`, and the event envelope validates against the shared contract.

**TC-16 Forced failure between state write and event append leaves neither**
- AC: 4.1 · Level: integration with fault injection (OQ-3) · Negative/edge: negative
- Steps: enable the fault seam to throw (a) after the state write and before the event append, and (b) after the event append and before commit. Trigger the state change. Then disable the fault and inspect the state, the stored events and an open SSE client.
- Expected: in both cases the state is unchanged, no new event is stored, the SSE client receives nothing, and the next real event's id follows on without a visible gap (or the gap behaviour matches OQ-6). The caller gets an error in the standard shape.

**TC-17 New event reaches an open stream in under 1 second**
- AC: 4.2 · Level: integration · Negative/edge: no
- Steps:
  1. Open the stream with a test SSE client.
  2. Trigger 20 events, one at a time (OQ-4). For each, record the time T0 just before the trigger request is sent, and T1 when the client parses the event.
- Expected: every T1 − T0 is under 1000 ms (the maximum, not the average), measured on the same machine and clock (OQ-5). All 20 events arrive, in order.

**TC-18 Reconnect with last event id gets exactly the missed events**
- AC: 4.3 · Level: integration · Negative/edge: edge
- Steps:
  1. Produce events 1..N while connected, then disconnect.
  2. Produce events N+1..N+5.
  3. Reconnect, passing N as the last event id (via `Last-Event-ID` and/or the `since` parameter, OQ-6).
  4. Edge cases: reconnect with id 0, with the latest id (nothing missed), and with an id greater than the maximum or a non-numeric id.
- Expected: step 3 receives exactly N+1..N+5, in ascending id order, with no duplicates and nothing ≤ N, then continues live. Step 4 gives all events, nothing, and the behaviour defined in OQ-6 respectively. The process never crashes.

**TC-19 No gap or duplicate when events arrive during replay**
- AC: 4.3 · Level: integration · Negative/edge: edge (race)
- Steps: reconnect with an old id while a background loop triggers events continuously, then stop the loop. Repeat 10 times.
- Expected: the client's received ids form a contiguous ascending sequence with no duplicates in every run. Any flakiness is reported with its run count.

**TC-20 Events survive a backend restart**
- AC: 4.4 · Level: integration · Negative/edge: no
- Steps:
  1. Produce events 1..N and stop the backend.
  2. Start it again on the same temp data dir.
  3. Open the stream from id 0, then trigger one new event.
- Expected: events 1..N are replayed with their original ids, types and payloads. The new event's id is greater than N.

### US-5 Project registry

**TC-21 Both products registered from the real adapter files**
- AC: 5.1 · Level: integration (+ contract via TC-08) · Negative/edge: no
- Preconditions: backend started with the repo's real `adapters/*.yaml` (Q5: registration only, and the single existence test is the only access to the product folders).
- Steps: list the projects.
- Expected: exactly `furwatch-api` with base `dev_v3` and `furwatch-app` with base `origin/dev_v3`, both available. The test reads no file inside `../furwatch-api` or `../furwatch-app`; it only checks that each path exists.

**TC-22 Adapter with a missing path is listed as unavailable**
- AC: 5.2 · Level: integration · Negative/edge: edge
- Preconditions: FX-3 adapters dir with `missing-path.yaml`, whose path points to a non-existent temp folder.
- Steps: start the backend; list the projects; call health.
- Expected: the backend starts and is healthy. The project is listed as "unavailable" with a reason that names the missing path. The other fixture project is available.

**TC-23 Invalid adapter is rejected and the others still load**
- AC: 5.3 · Level: unit (adapter validator, table-driven) + integration (startup) · Negative/edge: negative
- Steps:
  - Unit: validate each FX-3 invalid adapter: malformed YAML, a missing required field (path or base ref), a wrong type (secret paths as a string), an unknown top-level key (if the schema is strict), a duplicate project id, and an empty file.
  - Integration: start the backend with one invalid and one valid adapter.
- Expected:
  - Unit: each adapter is rejected with a message naming the file and the field or the YAML line.
  - Integration: the backend starts; the valid project is listed; the invalid one is either absent or listed as rejected (per the design), and its validation message is visible through the API and in the log. The message does not echo the file content beyond the field name.

**TC-24 Secret-path list matches the adapter and shows no values**
- AC: 5.4 · Level: integration · Negative/edge: negative aspect (no values)
- Preconditions: FX-1 and FX-3 (the fixture adapter declares the FX-1 secret globs).
- Steps: fetch the fixture project's details, including its secret-path list.
- Expected: the list equals the adapter's `secretPaths` (same globs, same order or set equality per the design; whether the global list is merged in is OQ-19). Canary sweep of the response body: zero hits. The response holds only glob patterns.

### US-6 Read-only tools behind the permission engine
All US-6 cases use the FX-1 repo and the FX-3 fixture adapter, and call tools through the internal API or test entry point (Q2, OQ-4) with role `tester` unless stated otherwise. After each case, a canary sweep runs over the response, the events stored for the run and the log files written during the run (OQ-14).

**TC-25 Allowed role can list, read and search**
- AC: 6.1 · Level: integration · Negative/edge: no
- Steps:
  1. `fs.list` on the root and on `src/`.
  2. `fs.read` on `src/app.txt`.
  3. `search.text` for `hello-fixture`.
- Expected:
  - Each call succeeds with the expected content: the list includes `src/app.txt`, the read returns its exact text, and the search returns its line.
  - For each call, a `tool.decided` event with decision `allow` and then a `tool.finished` event are stored, in that order and with the same correlation.
  - The events validate against the envelope contract.

**TC-26 Search and list never expose secret content**
- AC: 6.1 (edge), 6.2 · Level: integration · Negative/edge: negative
- Steps:
  1. `search.text` for the shared marker `shared-marker`, which appears in both `src/app.txt` and `.env`.
  2. `search.text` for a canary.
  3. `fs.list` on the root.
- Expected:
  - Step 1 returns only the `src/app.txt` hit.
  - Step 2 returns no hits.
  - Step 3 either lists secret file names without content or hides them (OQ-10).
  - Canary sweep: zero hits.

**TC-27 Direct read of secret paths is denied**
- AC: 6.2 · Level: unit (path policy, table-driven) + integration (one tool call per row) · Negative/edge: negative
- Steps: `fs.read` on each FX-1 secret file: `.env`, `.env.local`, `config/appsettings.json`, `config/appsettings.Development.json`, `Keys/signing.key`, `ServiceAccounts/sa.json`, `certs/server.pem`, `certs/client.pfx`, `certs/apns.p8` and `deep/a/b/.env.production`.
- Expected: each call is denied. A `tool.decided` deny event names the matching rule (adapter secret path or global list). No `tool.finished` event with content is stored. Canary sweep: zero hits.

**TC-28 Secret-path matching cannot be bypassed by spelling (Windows)**
- AC: 6.2 · Level: unit (normaliser and matcher) + integration (a subset through the tool API) · Negative/edge: negative
- Steps: `fs.read` the FX-1 `.env` and `config/appsettings.json` using:
  - case variants: `.ENV`, `Config/AppSettings.JSON`;
  - backslashes and mixed slashes: `config\appsettings.json`, `config/\appsettings.json`, `config//appsettings.json`;
  - dot segments: `./.env`, `src/../.env`, `src\..\config\appsettings.json`;
  - Windows-specific forms: a trailing dot or space (`.env.`, `.env `), an alternate data stream (`.env::$DATA`), the 8.3 short name if one exists (`APPSET~1.JSO`);
  - an absolute path inside the root, with different drive-letter case;
  - URL-encoded forms (`%2e%2e%2f`, `.%65nv`), if the tool API carries paths in URLs.
- Expected: every variant is denied with a secret-path rule (not a "file not found" that hints at content), and the canary sweep has zero hits.

**TC-29 `git show` of a secret path is denied, including history**
- AC: 6.2 · Level: integration · Negative/edge: negative
- Steps: call `git.show` with:
  - `HEAD:.env`, `HEAD:./.env`, `HEAD:config\appsettings.json`, `HEAD:CONFIG/APPSETTINGS.JSON`;
  - `<c2>:deleted/.env.old` (a secret deleted at HEAD but present in history);
  - a blob id of the `.env` blob passed directly (`git show <blob-sha>`);
  - a tree-ish form (`HEAD^{tree}:.env`).
- Expected: each call is denied, or returns no secret content if the blob-id form cannot be mapped to a path (OQ-11). A deny event names the rule. Canary sweep: zero hits.

**TC-30 Path-scoped `git diff` on a secret path is denied**
- AC: 6.2 · Level: integration · Negative/edge: negative
- Steps: call `git.diff` between c1 and c2 with pathspec `.env`, then `config/`, then the glob `*.json`, then `:(icase).ENV`.
- Expected: a pathspec that names only secrets is denied with a deny event. A pathspec that mixes secret and non-secret files either is denied or returns only the non-secret hunks (OQ-11). Canary sweep: zero hits.

**TC-31 Whole-repo `git diff` and whole-commit `git show` cannot leak a secret**
- AC: 6.2 · Level: integration · Negative/edge: negative (key case)
- Preconditions: FX-1 commit c2 changes `.env`, `config/appsettings.json` and `src/app.txt`; c3 deletes `deleted/.env.old` and renames `Keys/old.key` to `Keys/new.key`.
- Steps: call `git.diff` c1..c2 and c2..c3 with no pathspec, `git.diff` on the working tree with a modified untracked `.env`, and `git.show c2` and `git.show c3` with no path.
- Expected:
  - The `src/app.txt` hunks are returned.
  - The secret files appear at most as a name or stat line, or the whole call is denied (OQ-11).
  - No added, removed or context line from any secret file appears, including deleted and renamed secrets.
  - The canary sweep has zero hits in the response, the events and the logs.

**TC-32 Path traversal and absolute paths outside the root are denied**
- AC: 6.3 · Level: unit (path resolver, table-driven) + integration (subset) · Negative/edge: negative
- Steps: `fs.read`, `fs.list` and `search.text` (path scope) with:
  - `..\..\outside.txt`, `../outside.txt`, `..\/..\outside.txt`, `src\..\..\outside.txt`;
  - the absolute path of FX-4 `outside.txt`, and of `C:\Windows\win.ini`;
  - `\\?\` and `\\.\` prefixed absolute paths, a UNC path to the same file (`\\localhost\<drive>$\...`), a drive-relative `C:outside.txt`, and a path on another drive letter;
  - the sibling folder `<root>-evil\secret.txt`, which shares the root's prefix (to catch a naive prefix-string check);
  - encoded `%2e%2e%5c` if paths travel in URLs;
  - `git.show HEAD:../outside.txt`.
- Expected: every call is denied with an outside-root rule, and no FX-4 content (its own canary) appears anywhere. An absolute path that resolves **inside** the root, including drive-letter case differences, is treated the same as the equivalent relative path.

**TC-33 Symlinks and junctions cannot escape the root or unmask a secret**
- AC: 6.3, 6.2 · Level: integration · Negative/edge: negative
- Preconditions: FX-1 is extended at test time with:
  - a directory junction `src/jn` pointing to the FX-4 folder (`mklink /J`, no admin needed);
  - a file symlink `src/link.txt` pointing to FX-4 `outside.txt`;
  - a file symlink `src/notes.txt` pointing to `.env` inside the root.
  
  File symlinks need Windows Developer Mode. If it is not available, those rows are reported as **SKIPPED with the reason**, never as PASS.
- Steps: `fs.read` `src/jn/outside.txt`, `src/link.txt` and `src/notes.txt`; `fs.list src/jn`; `search.text` on the FX-4 canary over the whole root.
- Expected: reads through the junction or the outside link are denied (outside root). The `notes.txt` link is denied (it resolves to a secret path). Listing and search do not traverse into the junction. Canary sweep (FX-2 and FX-4 canaries): zero hits.

**TC-34 Unknown tool, unknown role and ungranted tool are denied by default**
- AC: 6.4 · Level: unit (permission engine) + integration · Negative/edge: negative
- Steps: call:
  - an unknown tool name `fs.delete`, an empty tool name, and a case variant `FS.READ`;
  - a known tool with unknown role `admin`, with an empty or missing role, and with role case variant `Tester`;
  - a known role with a tool it is not granted (`fs.write`, `cmd.run`, `git.commit`);
  - a valid tool and role with malformed arguments.
- Expected: no call executes. Each is denied with a `tool.decided` deny event naming the default-deny rule, except schema-invalid arguments, which return an error result as decided in OQ-13. No file is created or changed in FX-1 (its `git status` is clean, and file hashes are unchanged).

**TC-35 Fake connection string and private key are redacted on an allowed read**
- AC: 6.5 · Level: unit (redactor, table-driven) + integration · Negative/edge: no
- Preconditions: FX-1 `docs/setup-notes.md`, a non-secret path containing FX-2 values: a SQL connection string with a password canary, an Azure-style `AccountKey=` string, a PEM `PRIVATE KEY` block, an `RSA PRIVATE KEY` block, and a fake JWT.
- Steps:
  1. `fs.read` the file.
  2. `search.text` for `Server=`.
  3. `git.show HEAD:docs/setup-notes.md`.
  4. Read the stored events for the run, and the log files written during it.
- Expected:
  - All calls are allowed (the path is not secret).
  - Each secret value is replaced by the redaction marker (OQ-14) in the response, the `tool.finished` event and the logs.
  - Non-secret text around the values is kept, for example the key name `Password=` and the line `-----BEGIN PRIVATE KEY-----` or its marker.
  - Canary sweep: zero hits.
  - Unit: the redactor also handles CRLF line endings, a key block split across a search-result boundary, and values in JSON-escaped form.

**TC-36 Redactor does not over-redact ordinary text**
- AC: 6.5 (edge) · Level: unit · Negative/edge: edge
- Steps: run the redactor on ordinary text: `password` in a sentence, `Server` as a heading, a short base64-like word, and `BEGIN` in prose.
- Expected: the text is unchanged. This keeps the redactor from hiding all output and still "passing" TC-35.

**TC-37 Writes to policy files, and all writes in M1, are denied**
- AC: 6.6 · Level: integration · Negative/edge: negative
- Steps: as several roles (`tester`, `be`, unknown), try to write to:
  - the policy files (FX-5 test policy copy), using every write-capable tool name in the catalog (`fs.write`, `fs.edit`, `artifact.write`);
  - the same targets through a traversal path or a case variant of the path;
  - a plain non-policy file in FX-1.
- Expected: every call is denied with a deny event naming the rule (policy protection, or "no write tools in M1"). The SHA-256 of every policy file and of FX-1 is unchanged.

**TC-38 End-of-suite canary sweep of all persisted output**
- AC: 6.2, 6.5 · Level: integration (runs last in the backend integration suite) · Negative/edge: negative
- Steps: after all US-6 cases, search for every FX-2 and FX-4 canary (exact text, plus base64 and URL-encoded forms) in:
  - the raw bytes of the database file, including WAL or journal files;
  - every log file under the temp data dir;
  - the event stream replayed from id 0;
  - the captured stdout and stderr of the backend process.
- Expected: zero hits. On a failure, the sweep reports the file and offset, never the matched value.

### US-7 Minimal UI

**TC-39 Projects view lists both products with base branch and availability**
- AC: 7.1 · Level: e2e (Playwright, installed Chrome) · Negative/edge: includes edge
- Preconditions: backend serves the built UI on its port. Run A uses the real adapters (registration only). Run B uses FX-3 with the missing-path adapter.
- Steps: open the Harness URL as the PO would (the token is injected by the served page, OQ-1); go to the Projects view.
- Expected:
  - Run A: `furwatch-api` · `dev_v3` · available, and `furwatch-app` · `origin/dev_v3` · available.
  - Run B: the missing-path project shows "unavailable" and its reason.
  - No console errors. No secret-path values or canaries appear in the DOM.

**TC-40 Timeline shows a new event without reload**
- AC: 7.2 · Level: e2e · Negative/edge: no
- Steps:
  1. Open the Timeline view and set a marker on the page (for example `window.__tcMarker = 1`).
  2. Trigger an event from the test (OQ-4).
  3. Wait up to 2 s for the new entry.
- Expected: the entry appears with its type and time. The marker still exists (no reload or navigation happened). Entries are in id order.

**TC-41 Timeline reconnects after a backend restart and shows missed events**
- AC: 7.3 · Level: e2e · Negative/edge: edge
- Steps:
  1. Open the Timeline view and note the last shown event id N. Set the page marker.
  2. Stop the backend. Check that the UI shows a disconnected state, if the design has one.
  3. Start it again on the same data dir, and produce events N+1..N+3 before the UI reconnects (for example startup events, or events triggered immediately; OQ-7).
  4. Wait for the UI to reconnect by itself.
- Expected: without a reload (the marker is still present), the Timeline shows N+1..N+3 once each and in order. Earlier entries are not duplicated. Note: the session token is regenerated on each start, so this case depends on OQ-7.

## Fixtures
All fixtures are generated at test time into a per-run temp directory (under `%TEMP%` or a gitignored `.harness/test-tmp/`). No nested `.git` folder is committed. The generator is test code in `tests/fixtures/`, and only the generator and its constants are committed. **The product repositories are never read or copied.** All values are invented.

**FX-1 Fixture git repo** (generated: `git init`, local `user.name`/`user.email`, `core.autocrlf=false`, three commits)
- c1:
  - `src/app.txt` (`hello-fixture`, `shared-marker`), `README.md`;
  - `docs/setup-notes.md` (FX-2 redaction values, non-secret path);
  - `.env`, `.env.local`, `deep/a/b/.env.production`, `config/appsettings.json`, `config/appsettings.Development.json`;
  - `Keys/signing.key`, `Keys/old.key`, `ServiceAccounts/sa.json`;
  - `certs/server.pem`, `certs/client.pfx` (text placeholder), `certs/apns.p8`;
  - `deleted/.env.old`.

  Each secret file holds its own canary, and `.env` also holds `shared-marker`.
- c2: change `.env` (new canary), `config/appsettings.json` and `src/app.txt`.
- c3: delete `deleted/.env.old`; rename `Keys/old.key` to `Keys/new.key`.
- TC-33 adds junctions and links at test time, inside a copy of FX-1.

**FX-2 Fake secret values** (each canary is unique per file, so a sweep hit shows its source)
- Canary format: `FAKE-DO-NOT-USE-<TCID-or-FILE>-<4 digits>`, for example `FAKE-DO-NOT-USE-ENV-0001`.
- Connection string: `Server=tcp:fake-db.invalid,1433;Database=FakeDb;User Id=fake_user;Password=FAKE-DO-NOT-USE-PW-0001;`
- Storage-style string: `DefaultEndpointsProtocol=https;AccountName=fakeacct;AccountKey=FAKE-DO-NOT-USE-ACCOUNTKEY-0002;EndpointSuffix=core.invalid`
- Private key block: `-----BEGIN PRIVATE KEY-----` / a body line of base64 that decodes to `FAKE-DO-NOT-USE-PRIVKEY-0003`, padded to a realistic length / `-----END PRIVATE KEY-----`. The same is done with `RSA PRIVATE KEY`. These are not valid keys.
- Fake JWT: three base64url segments whose payload decodes to `{"sub":"FAKE-DO-NOT-USE-JWT-0004"}`.
- Hosts use the reserved `.invalid` TLD. No real-looking provider key prefixes are used beyond what the redactor needs to be tested.

**FX-3 Adapter fixtures** (generated YAML in a temp adapters dir)
- `fixture.yaml`: a valid adapter for FX-1, with base ref `main` and `secretPaths` covering the FX-1 secret files.
- `missing-path.yaml`: a valid adapter whose path does not exist.
- Invalid adapters: `bad-yaml.yaml` (malformed), `no-path.yaml`, `no-base.yaml`, `wrong-type.yaml`, `dup-id.yaml`, `empty.yaml`.
- The real `adapters/*.yaml` in the repo are used only by TC-21 and TC-39 run A.

**FX-4 Outside-root folder**: a sibling temp folder holding `outside.txt` with the canary `FAKE-DO-NOT-USE-OUTSIDE-0005`. It also includes `<root>-evil/secret.txt` for the prefix test.

**FX-5 Test policy copy**: the policy files are copied into the temp data dir, so a failed deny in TC-37 cannot change the real `policy/*.yaml`. Hashes are recorded before the test runs.

**Isolation**: each integration or e2e run uses its own temp data dir, port, session file and log dir (OQ-2), and never the developer's `.harness/`. The generators are cleaned up after the run, except on failure, when they are kept for evidence. The canary sweep runs before cleanup.

## Environment
- Windows 11 Pro; all scripts run in PowerShell (no `VAR=x cmd`; environment variables are set via `$env:`).
- Node 24.22.3 via fnm (`.node-version`). The system Node 20.20.1 must not be used: TC-01 asserts the version.
- pnpm 12.23.0; the frozen-lockfile install uses only gate-4 approved packages.
- Playwright uses the installed Chrome (channel `chrome`, Q4). No browser download.
- git for Windows on PATH (fixtures, TC-05). Developer Mode is optional (TC-33 file symlinks; rows are skipped without it).
- Backend on 127.0.0.1. Tests use their own ports (OQ-2) so they do not clash with a running Harness on 7420, the UI dev server on 5173, furwatch-api on 7149 or furwatch-app on 4200.
- No LLM calls, no network apart from the package registry for TC-01, and no access to `../furwatch-api` or `../furwatch-app` beyond the path-existence check in TC-21 and TC-39.

## Open questions for the Architect
> All 19 are answered in `design.md` §11 (Architect, 2026-11-25). Adjust the test steps to those answers during implementation.
1. **Session token in tests.** How does a test get the token: by reading the session file in a test data dir, from an environment override, or from a test-only start option? How is the token sent on the SSE stream (header or query)? This affects TC-11 (e).
2. **Test configuration.** Can the backend start with a configurable port (ideally port 0, reporting the actual port), data dir, adapters dir, policy dir and log dir? This is needed for isolation and parallel runs.
3. **Fault injection for AC-4.1.** What seam forces a failure between the state write and the event append, and between the append and the commit? For example, a test-only hook enabled by configuration and compiled out or disabled in normal runs.
4. **On-demand events.** How does a test trigger a state change or an event in M1 (TC-15/17/19/40/41)? An internal tool call (Q2), re-registering a project, or a test-only endpoint?
5. **Latency for AC-4.2.** Is T0 the trigger-request send time (proposed) or the event's `ts`? Is the bound measured as a maximum over 20 events? Does SSE buffering or compression need to be disabled?
6. **Stream resume.** Is resume by `Last-Event-ID`, `since`, or both? What happens when the id is greater than the maximum, or not numeric? Can ids have gaps after a rolled-back transaction (SQLite autoincrement)?
7. **Restart and token rotation (AC-7.3).** The token is regenerated on every start, but the open page holds the old one and must not reload. How does the UI re-authenticate after a restart? Also: which events exist right after a restart, to show "missed" events?
8. **Health when the database is down.** What status code and body does health return when the service is up but the database is not OK?
9. **Check order and allowlists.** Which comes first when the token and the Origin are both bad (401 or 403)? Are OPTIONS, health and static UI assets behind the token? What are the exact allowed Origin and Host values, including the 5173 dev server?
10. **Secret files in `fs.list` and `search.text`.** Are secret file names hidden or shown? Is search over secret files skipped silently or denied?
11. **Git with mixed or whole-repo scope.** For `git.diff` and `git.show` with no path, or with a path that mixes secret and non-secret files: is the call filtered (secret files excluded, or shown as stat only, with a marker) or denied? How is `git show <blob-sha>` handled? What event is recorded for a partly filtered result?
12. **Links.** Are symlinks and junctions resolved to their real path and then checked, or is any reparse point denied? How are 8.3 short names, alternate data streams, and trailing dots or spaces normalised?
13. **Deny versus error.** Is the role validated by schema (an unknown role would then be a schema error) or by the permission engine? AC-6.4 needs a `tool.decided` deny. Is there a stable rule-id format for deny events?
14. **Redaction and logs.** What is the redaction marker format? Where are logs written, and in what format? Are tool payloads logged at all? Is the database file allowed to hold redacted tool output only?
15. **AC-2.1 enforcement.** What mechanism detects an app redefining a shared contract: a lint rule, a custom static check, or a review only?
16. **AC-2.3 meta-test.** Can the contract-test runner be pointed at a stub server or recorded responses, so the negative case can be tested?
17. **AC-1.3 lint rule.** Which tool or rule enforces the boundary, and does its message name the file and the import? Does it cover both relative paths and package-name imports?
18. **AC-1.1 network.** Does the clean-clone install run against the online registry or an offline store? This decides whether TC-01 can run without network.
19. **AC-5.4 list content.** Does the secret-path view show only the adapter's list, or the adapter's list merged with the global list from `security-policy.md` §1? AC-5.4 says "matches the adapter file".
