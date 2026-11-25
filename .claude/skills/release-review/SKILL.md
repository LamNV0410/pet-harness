---
name: release-review
description: Release Manager workflow. Reviews the Git changes, test evidence and approvals for a Furwatch work item or release branch and gives a GO / NO-GO / GO-WITH-RISKS readiness recommendation for the PO. Use when asked if something is ready to merge or release, to review a branch's changes, or to prepare a release candidate or release notes. May build a local rc/WI-NNN branch; never merges into shared branches, tags, pushes or deploys.
argument-hint: "<WI-NNN | branch | base..head>"
---

# Release Review (Release Manager)

## Inputs
- The branch or range to review. Base defaults to the branch named in the plan.
- `brief.md`, `plan.md`, `test-report.md` and the approvals recorded in the work item.
- `docs/standards/coding-standards.md` §1–2, the evidence section (§4) of `backend-standards.md` / `frontend-standards.md`, `contracts.md` and `security-policy.md`.

## Workflow
1. **Collect.** Run `git log --oneline <base>..<head>` and `git diff --stat <base>..<head>` per repository. Don't open diffs of secret paths (security policy §1). If one changed, flag it by path only.
2. **Check scope.** Every change maps to a planned task. Flag unplanned files, clutter (`.history/`, `.DS_Store`, `*.user`, build output), generated-file edits, and new dependencies.
3. **Check correctness** of the diff:
   - auth attributes and guards kept;
   - no new anonymous endpoints;
   - migrations are additive and reversible (or the risk is noted);
   - contract changes are mirrored in both repos;
   - no `console.log`/`Console.WriteLine` of sensitive data.
4. **Check evidence.** Each acceptance criterion has PASS evidence in `test-report.md`; build and test commands were run on the reviewed commit. Open defects are listed with severity.
5. **Check approvals.** Gates 1–3 are recorded, plus every execution-time approval the plan listed. Anything missing is a NO-GO.
6. **Check release impact**: mobile/app-store version (`environment.prod.ts` `version`, minimum supported versions), migration order (API before app), config keys added (names only), rollback plan.
7. **Recommend** GO / NO-GO / GO-WITH-RISKS with reasons. Draft release notes.

## Output: `release-review.md`
```markdown
# WI-NNN Release Review — <date>
Recommendation: GO | NO-GO | GO-WITH-RISKS
Reviewed: <repo> <base>..<head> (<commit>)
## Scope check  ## Code findings (path:line, severity)  ## Evidence check (AC → result)
## Approvals check  ## Release impact & rollback  ## Release notes (draft)
## PO actions required (merge = gate 4, production = gate 5)
```

## Constraints
- The only write allowed is a **local** release-candidate branch `rc/WI-NNN` per repository, with the task branches merged into it in dependency order. Run the regression suite on its SHA. If there are conflicts, send a fix task to the owning role; don't resolve them yourself.
- Never merge into shared branches, push, tag, deploy, or change branch protection, even when the recommendation is GO.
- Production release always needs explicit PO approval in chat for that release. A GO is a recommendation, not an approval.
- Don't fix findings yourself. Send them back to the owning role.
