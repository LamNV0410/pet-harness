---
name: fe-implementation
description: FE Agent workflow for implementing one approved frontend task — in furwatch-app (Angular/Ionic/Capacitor) or the Harness apps/frontend — on its own branch, consuming only agreed shared contracts, following the frontend standards, with lint/test/build evidence. Use when asked to implement, fix or code a planned UI or frontend task (WI-NNN-Tn owned by FE), or a contract task in packages/shared assigned to FE. Not for backend work, unplanned changes, design decisions or releases.
argument-hint: "<WI-NNN-Tn>"
---

# Frontend Implementation (FE Agent)

## Inputs
- The task row in `docs/work-items/WI-NNN-*/plan.md` (approved at gate 3, owner **FE**), plus the acceptance criteria in `brief.md` and the `design.md` it references.
- `docs/standards/frontend-standards.md`, and `docs/standards/contracts.md` if the task calls an API or touches `packages/shared`.
- `docs/discovery/frontend.md`. Where it conflicts with `../furwatch-app/CLAUDE.md`, discovery wins (§5).

## Workflow
1. **Confirm readiness.** The plan is approved, the owner is FE, and the dependencies are done (normally the contract task and the BE task). Stop and report if either is true:
   - `furwatch-app` still can't be built (decision D1);
   - the task targets `apps/frontend` or `packages/shared` before the stack is chosen (D4).
2. **Branch.** Create `fw/WI-NNN-Tn-<slug>` from the base the plan names. Use a git worktree.
3. **Contract check.** Use only the endpoints, types and errors the agreed contract declares. If something is missing, stop and hand back to the Orchestrator. Don't invent fields. If the BE task isn't done yet, work against mocks built from the shared types, in test code only.
4. **Read before writing.** Find the existing pattern (frontend standards §2 or §3) and cite it in the report.
5. **Implement** the smallest change that meets the acceptance criteria. Add or extend tests with real assertions in the same change. Add UI text to every language file.
6. **Gate check.** Stop and ask the PO before any of these:
   - adding a package;
   - pointing a run at a beta or prod API;
   - touching native project config;
   - touching secret paths.
7. **Verify.** Run the evidence commands from frontend standards §4. Never report a step you didn't run as passing.
8. **Commit** locally with `<type>(<area>): <summary>` and the task ID. **Don't push.**
9. **Report.** Write the task report and hand off to the Tester (agent-design §3).

## Output: task report (`WI-NNN-*/tasks/Tn.md`)
- Branch, commit hashes, and files changed (`git diff --stat`).
- The pattern followed (`path:line`) and any deviations, with the reason for each.
- Contracts consumed, and any mocks used (path).
- Evidence: the commands run, each with a pass/fail summary.
- Acceptance criteria believed met, anything not done, and follow-ups found but not fixed.

## Constraints
- Edit only `apps/frontend`, `../furwatch-app` and frontend tests. Edit `packages/shared` only as the named owner of a contract task. Never edit backend code.
- Change only the files the task needs. No refactors, renames or formatting sweeps.
- Don't edit `android/`, `ios/`, `www/`, `dist/` or plugin `example-app/`.
- Never weaken route guards or role checks without PO approval.
