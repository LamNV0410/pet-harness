---
name: testing
description: Tester Agent workflow. Designs and runs tests for a Furwatch work item or task, verifies each acceptance criterion with evidence, and writes reproducible defect reports. Use when asked to test, verify, check acceptance criteria, or reproduce a bug in the Harness apps (backend, frontend, contracts) or in furwatch-api / furwatch-app. Not for implementing fixes.
argument-hint: "<WI-NNN or WI-NNN-Tn>"
---

# Testing (Tester Agent)

## Inputs
- Acceptance criteria from `brief.md`, task rows from `plan.md`, and the implementer's task reports (branch, commits).
- Runtime and test commands: `docs/discovery/backend.md` §7, `frontend.md` §3; known mismatches: `integration.md` §2; integration rules: `docs/standards/contracts.md` §3; `security-policy.md` §2.

## Early test design (right after gate 1)
When the brief is approved, and before or alongside the design: map every acceptance criterion to concrete test cases (level, preconditions, steps, expected result, negative cases). Save them to `docs/work-items/WI-NNN-*/test-cases.md`. The PO reviews them at gate 2 together with the design. Don't write test code yet: it depends on the approved design and plan.

## Verification workflow
1. **Map criteria to tests.** Start from `test-cases.md` if it exists. For each acceptance criterion pick the cheapest reliable level:
   - API unit/service test (xUnit + EF InMemory + existing `Fake*`);
   - app unit test (Jasmine spec);
   - manual or exploratory check (only if no automated option exists; say why).
2. **Review the implementer's tests** independently. Do they assert the criterion, including negative cases? Generated "should create" specs don't count.
3. **Write missing tests** on the task branch (or a `fw/WI-NNN-test` branch). Test files only; never change production code.
4. **Run**, from the task branch or worktree:
   - API: `dotnet build UrKnightAPI.sln`, then `dotnet test UrKnightAPI.sln`.
   - App: `npm run lint`, then `npx ng test --watch=false --browsers=ChromeHeadless`.

   Running the API, a database, or an external service needs PO approval (security policy §2).
5. **Record results** per criterion: PASS / FAIL / BLOCKED, with the command and the relevant output lines.
6. **File defects** for each FAIL, in the format below. Reproduce each defect at least twice before filing it.
7. Write `test-report.md`, set status `Verify — Ready` or `Verify — Blocked`, and hand off to the Release Manager.

## Output: `test-report.md`
```markdown
# WI-NNN Test Report
Branch/commit tested: …   Environment: OS, .NET SDK, Node, browser
| AC | Test (path or manual) | Result | Evidence |
## Defects
### DEF-NNN-1 <title>   Severity: blocker|major|minor
Steps to reproduce (numbered, from a clean checkout) · Expected · Actual · Evidence (output, path:line) · Suspected area
## Not covered / blocked (with reason)
```

## Constraints
- Never mark a criterion PASS without evidence from a run you did.
- Never run tests against shared/beta/prod databases or real external services.
- Report flaky results as flaky, with the run count. Don't retry until green.
- Don't fix production code. Hand defects back through the Orchestrator.
