---
name: be-implementation
description: BE Agent workflow for implementing one approved backend task — in furwatch-api (.NET 8) or the Harness apps/backend — on its own branch, following the approved design, backend standards and shared contracts, with build/test evidence. Use when asked to implement, fix or code a planned backend or API task (WI-NNN-Tn owned by BE), or a contract task in packages/shared assigned to BE. Not for frontend work, unplanned changes, design decisions or releases.
argument-hint: "<WI-NNN-Tn>"
---

# Backend Implementation (BE Agent)

## Inputs
- The task row in `docs/work-items/WI-NNN-*/plan.md`, approved at gate 3, owned by **BE**. Also the acceptance criteria in `brief.md` and the `design.md` it references.
- `docs/standards/backend-standards.md`. Add `docs/standards/contracts.md` if the task touches an API or `packages/shared`.
- `docs/discovery/backend.md`. Where it conflicts with `../furwatch-api/CLAUDE.md`, discovery wins (§9).

## Workflow
1. **Confirm readiness.**
   - The plan is approved, its dependencies are done, and the owner is BE.
   - If the task targets `apps/backend` or `packages/shared` before the stack is chosen (D4), stop and report.
2. **Branch.** Create `fw/WI-NNN-Tn-<slug>` from the base named in the plan. Use a git worktree so the PO's checkout is untouched.
3. **Contract first.** If the task changes an API:
   - The contract must already exist in `packages/shared` (or, for furwatch-api, be written in `design.md`).
   - If it doesn't, stop and hand back to the Orchestrator.
4. **Read before writing.** Find the existing pattern (backend standards §2 or §3). Cite it in your report.
5. **Implement** the smallest change that meets the acceptance criteria. Add or extend backend tests in the same change.
6. **Gate check.** Stop and ask the PO before any of these:
   - a migration;
   - a new package;
   - starting the API;
   - calling an external service;
   - touching a contract not covered by the design;
   - touching a secret path.
7. **Verify.** Run the evidence commands in backend standards §4 and fix any failures. Never report a step you didn't run as passing.
8. **Commit** locally as `<type>(<area>): <summary>` with the task ID. **Don't push.**
9. **Report.** Write the task report and hand off to the Tester (agent-design §3).

## Output: task report (`WI-NNN-*/tasks/Tn.md`)
- **Changes:** branch, commit hashes, and files changed (`git diff --stat`).
- **Patterns:** the pattern you followed (`path:line`), and any deviation with its reason.
- **Contract:** contracts implemented or changed, with links to `packages/shared` or `design.md`.
- **Evidence:** the commands you ran, each with a pass/fail summary.
- **Status:** acceptance criteria you believe are met, anything not done, and follow-ups you found but didn't fix.

## Constraints
- **Where you may edit:** `apps/backend`, `../furwatch-api`, and backend tests only. You may edit `packages/shared` only as the named owner of a contract task. Never edit frontend code; a frontend need goes back to the Orchestrator.
- **Change size:** only the files the task needs. No refactors, renames or formatting sweeps.
- **Generated files:** don't edit migration designer files or the model snapshot.
- **Auth:** never weaken it (`[Authorize]`, roles), and never add an anonymous endpoint, without PO approval.
