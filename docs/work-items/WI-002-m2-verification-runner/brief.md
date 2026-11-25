# WI-002 M2 — Verification runner
Status: Approved (gate 1 by PO; gates 2–3 delegated, 2026-11-25)

## Goal
The PO can build, test and lint each managed product from the Harness UI, on a clean copy of its base branch. The PO sees the output live and gets a stored pass/fail verdict per commit. All of this runs in an isolated git worktree, so the PO's own checkouts are never touched.

The later agents (M3+) and the Tester will reuse these verdicts as evidence.

**Affects:** the Harness (`apps/backend`, `apps/frontend`, `packages/shared`). The product repos are only read: worktrees are created from their git history.
**User roles:** PO (UI). Later, the Tester and BE/FE agents use the same runner.
**Source:** roadmap `07` §2 (M2), TD-07 (worktrees), adapters `adapters/*.yaml`.

## Current behaviour
- **VERIFIED: the M1 Harness is merged to `main` (`c950911`).**
  - It registers both projects from `adapters/*.yaml`.
  - It has read-only tools, the permission engine, the event store and SSE, and the Projects and Timeline views.
- **VERIFIED: commands are declared in the adapters but nothing can run them yet.**
  - `adapters/furwatch-api.yaml`: `build`, `test`, `install` (ask), `run` (ask, TD-13).
  - `adapters/furwatch-app.yaml`: `build`, `test`, `lint`, `install` (ask), `run` (ask).
- **VERIFIED: product runtime facts** (`discovery/backend.md` §7, `frontend.md` §3):
  - furwatch-api builds and tests with `dotnet build/test UrKnightAPI.sln`. INFERRED: the tests have no side effects (EF InMemory and fakes).
  - furwatch-app needs `npm install --legacy-peer-deps` first (there is no lockfile). Its source exists only on `origin/dev_v3` (D1).
  - Angular 18 needs **Node ≤ 22**. The system Node is 20.20.1; the Harness runs on Node 24.
- **VERIFIED: base refs.** The local `origin/dev_v3` of furwatch-api was last updated 6 days ago, so it may be behind GitLab unless it is fetched first.
- **UNKNOWN:**
  - whether `dotnet test` passes on a clean worktree today;
  - how long an `npm install` for furwatch-app takes on this machine, and whether it succeeds (no lockfile, peer conflicts).

## Questions for PO

| # | Question | Why it matters | Proposed default |
|---|---|---|---|
| Q1 | Should the Harness run `git fetch origin` (read-only, against GitLab) before it creates a worktree? | Without it, verification may test an old commit. With it, the Harness contacts GitLab using your stored git credentials. | **Yes**, with a "Fetch latest" option that is on by default, and the fetched SHA shown in the result. |
| Q2 | Should furwatch-app be in scope for M2? | It needs `npm install` in every new worktree: a large download, no lockfile, and `npm install` always needs approval. | **Yes, but second.** furwatch-api first. For the app, `install` runs only after you click Approve in the UI. |
| Q3 | Which Node should product commands use? | Angular 18 doesn't support Node 24. | Each adapter declares its runtime. **furwatch-app uses the system Node 20.** furwatch-api doesn't use Node. |
| Q4 | Who starts a verification in M2? | Agents arrive in M3. | **The PO, with a "Run" button** per project and command. An internal API that agents will use later is added at the same time. |
| Q5 | How many commands can run at once? | Cost, machine load, and less confusing logs | **One at a time per project, at most 2 in total.** Further runs wait in a queue. |
| Q6 | How long are logs and worktrees kept? | Disk usage (a `node_modules` folder can be hundreds of MB) | Keep the **last 20 runs' logs** per project. Delete each **worktree after its run**, unless you choose "Keep worktree" (cleanup of a kept worktree needs approval). |
| Q7 | Does the approval inbox belong in M2? | Q2 needs an Approve button. The full Approval Center is planned for M3. | **A minimal approval step in M2**: a pending card with the exact command, plus Approve/Deny. The full Approval Center stays in M3. |

## User stories and acceptance criteria

### US-1 Isolated worktree from a base ref
As the PO, I want each verification to run in a fresh git worktree created from the project's base ref, so that my own checkouts and branches are never changed.
- **AC-1.1** Given a project with base ref R, when a verification starts, then a worktree is created under the Harness data folder from R (after a fetch, if enabled). The commit SHA is recorded and shown.
- **AC-1.2 (negative)** Given the PO's own checkout of the product, when any verification runs, then its `git status` and current branch are unchanged afterwards.
- **AC-1.3 (edge)** Given an unknown or missing base ref, when a verification starts, then it fails before any command runs, with a clear reason.
- **AC-1.4** Given a finished run without "Keep worktree", when it ends, then its worktree is removed and `git worktree list` in the product repo no longer shows it.

### US-2 Run declared commands only
As the PO, I want the Harness to run only the commands declared in the project's adapter, so that no arbitrary command can run on my machine.
- **AC-2.1** Given an adapter command id (e.g. `build`), when it runs, then exactly its declared argv runs, without a shell, in the worktree, with the runtime the adapter declares (Q3).
- **AC-2.2 (negative)** Given a command id that isn't declared, or an attempt to pass extra arguments, when a run is requested, then it is rejected and the rejection is recorded as an event.
- **AC-2.3** Given a command marked `approval: ask` (e.g. `install`), when it is requested, then it waits as a pending approval with the exact argv. It runs only after the PO approves that single request.
- **AC-2.4 (negative)** Given a pending approval that the PO denies, when the denial is recorded, then the command never runs and the run ends as "denied".
- **AC-2.5** Given a command still running when the PO clicks Cancel, or when it exceeds its time limit, when that happens, then the whole process tree is stopped and the run ends as "cancelled" or "timed out".

### US-3 Live output and central logs
As the PO, I want to watch command output live and find it again later, so that I can see what failed without opening a terminal.
- **AC-3.1** Given a running command, when it writes output, then the lines appear in the UI within about 1 second, in order.
- **AC-3.2** Given a finished run, when the PO opens it later (also after a Harness restart), then the full log is available.
- **AC-3.3 (negative)** Given output that contains secret-looking values, when it is stored or shown, then those values are redacted, as in M1.

### US-4 Stored verdict per commit
As the PO and the later agents, I want a pass/fail verdict per (project, commit, command), so that the same check isn't paid for twice.
- **AC-4.1** Given a finished command, when its exit code is known, then a verdict is stored with project, SHA, command id, exit code, duration and a short summary. For dotnet/Karma tests, the summary includes the test counts where they can be parsed.
- **AC-4.2** Given a verdict that already exists for the same project, SHA and command, when the same verification is requested, then the stored verdict is offered and the command isn't re-run unless the PO chooses "Run again".
- **AC-4.3** Given the Projects view, when verdicts exist, then each project shows its latest build/test result and SHA.

### US-5 Verification UI
As the PO, I want a simple screen per project to start runs and follow them, so that M2 is usable without the command line.
- **AC-5.1** Given a project, when the PO opens it, then the PO sees the declared commands (each marked "needs approval" or not), a Run button for each, the run history, and a "Fetch latest" option.
- **AC-5.2** Given a run, when it is in progress, then the PO sees its state (queued → preparing worktree → running → passed/failed/cancelled/denied/timed out) and its live log.
- **AC-5.3** Given the Timeline, when runs happen, then their events (requested, approval, started, finished, verdict) appear there too.

## Non-functional notes and risks
- **Platform.** Windows 11 and PowerShell-safe. Process-tree kill must work on Windows.
- **Product repos.** Worktrees are created in `.harness/worktrees/` (gitignored). The products' working trees, branches and `main`/`dev_v3` are never written. Only the product repos' `.git/worktrees` metadata changes, and it is cleaned up when a worktree is removed.
- **Network.** `git fetch` (Q1), `dotnet restore` (implicit in build) and `npm install` all reach the internet. `npm install` always needs approval.
- **No LLM calls** in M2.
- **No product server is started** in M2 (that is M6, TD-13).
- **RISK:** `npm install` without a lockfile may fail or install different versions each time (`frontend.md` §4).
- **RISK:** `dotnet test` is INFERRED to be side-effect free. Watch the first run.
- **RISK:** disk use from worktrees and `node_modules` (Q6).

## Out of scope
Agents and LLM use (M3), file edits and commits in worktrees (M4), the full Approval Center (M3), starting product servers and health checks (M6), CI, automated tests for the Harness itself (still deferred under WI-001 T9).

## Approvals
- **Gate 1:** approved by the PO on 2026-11-25, with the defaults for Q1–Q7.
- **Gates 2–3:** delegated under the standing delegation (`docs/architecture/open-decisions.md`).
- **Tests:** Harness self-test design is skipped at the PO's direction.
