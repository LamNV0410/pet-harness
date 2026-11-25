---
name: task-planning
description: Breaks an approved Furwatch requirement brief (and design, if any) into ordered implementation and test tasks with owners (BE/FE/Tester), dependencies and completion criteria. Use after the PO has approved requirements and any needed design, or when asked to plan, break down or estimate work. Not for unapproved requirements.
argument-hint: "<WI-NNN or path to brief.md>"
---

# Task Planning (Architect / Orchestrator)

## Inputs
- `docs/work-items/WI-NNN-*/brief.md`, which must show PO approval (gate 1).
- `design.md`, if the work has design impact; it must show PO approval (gate 2).
- `docs/standards/coding-standards.md` §1–2, `contracts.md`, and §4 (evidence) of `backend-standards.md` / `frontend-standards.md`.

**Stop** if an approval is missing. Report which gate is missing and offer to run the right command.

## Workflow
1. **List the changes** each acceptance criterion needs, per area: Harness `packages/shared`, `apps/backend`, `apps/frontend`, `tests/`; products `../furwatch-api`, `../furwatch-app`; docs.
2. **Slice into tasks.** Each task:
   - has one owner role;
   - fits in one branch;
   - can be reviewed on its own;
   - leaves the build green.

   Order cross-area work as contract (`packages/shared`) → backend → frontend → `tests/` integration (agent-design §2.3). Each shared change is its own task with one named owner.
3. **Define each task** with ID `WI-NNN-Tn`, owner, area (folder or repo), branch name `fw/WI-NNN-Tn-<slug>`, depends-on, the acceptance criteria it covers, and **done criteria**: the evidence commands for the task's area (backend/frontend standards §4), plus task-specific checks.
4. **Add test tasks** for the Tester, mapping every acceptance criterion to at least one test task.
5. **List approvals** the plan will need during execution: migration, new package, starting the API, external service use.
6. **Check** that every acceptance criterion is covered, there are no dependency cycles, and nothing is out of scope.
7. Save `plan.md`, set status `Planning — Ready`, and ask the PO for **gate 3** approval.

## Output: `plan.md`
```markdown
# WI-NNN Plan
Status: Planning — Ready
| ID | Owner | Area | Summary | Depends on | Covers AC | Done when |
|----|-------|------|---------|------------|-----------|-----------|
## Approvals required during execution
## Risks / assumptions
## AC coverage check
```

## Constraints
- Don't change requirements or design while planning. Send gaps back to BA or Architect.
- No time estimates unless the PO asks.
- Don't create branches or start implementation. Planning is documentation only.
