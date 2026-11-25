---
name: requirement-analysis
description: BA Agent workflow. Turns a business request for Furwatch (furwatch-app / furwatch-api / Harness) into a requirement brief with ambiguities, user stories and testable acceptance criteria. Use when the PO describes a new feature, change or problem, or asks for user stories or acceptance criteria. Not for technical design or task breakdown.
argument-hint: "<request text or path to notes>"
---

# Requirement Analysis (BA Agent)

## Inputs
- The PO's request, in chat or as a file path.
- `docs/discovery/` — only the file(s) for the affected area (`backend.md`, `frontend.md`, `integration.md`).
- An existing `docs/work-items/WI-*/brief.md` if this refines earlier work.

## Workflow
1. **Restate** the goal in one or two sentences, from the user's point of view. Name the affected product(s) and user roles (pet owner/client, admin `G$SUPER_ADMIN`/`G$SYSTEM_ADMIN`).
2. **Ground it.** Find where the behaviour lives today (route, page, controller) and cite `path:line`. Mark anything you couldn't find as UNKNOWN.
3. **List ambiguities** as numbered questions. For each, say why it matters and propose a default answer.
4. **Write user stories**: `As a <role>, I want <capability>, so that <benefit>`. Keep each one independently deliverable.
5. **Write acceptance criteria** per story in Given/When/Then form. Each criterion must be observable by the Tester, through UI, an API response or a database row. Include at least one negative or edge case per story.
6. **Note non-functional needs and risks**: permissions/roles, mobile vs. web, i18n (en/my/vi), offline/BLE/location behaviour, data migration, external services.
7. **Mark scope**: in scope, and explicitly out of scope.
8. Save to `docs/work-items/WI-NNN-<slug>/brief.md` (next free number). Status: `Requirements — Ready`, then ask the PO for **gate 1** approval.

## Output: `brief.md`
```markdown
# WI-NNN <Title>
Status: Requirements — Ready
## Goal
## Current behaviour (with path:line, labelled)
## Questions for PO (numbered, with proposed default)
## User stories and acceptance criteria
### US-1 ...
- AC-1.1 Given … When … Then …
## Non-functional notes and risks
## Out of scope
```

## Constraints
- Describe what and why, never how. No designs, class names or schema choices.
- Don't treat a proposed default as decided until the PO answers.
- Don't invent business rules. If the code shows a rule, cite it. Otherwise ask.
- One brief per work item. Update the existing one rather than creating a second.

## Example
Request: "Owners should get a reminder before a subscription expires."
- Ground: the `subscription-expiry-reminder` Hangfire job already exists (`Worker/Schedules/Base/JobRegistrationService.cs`). INFERRED: email only.
- Question: "Push as well as email? Proposed default: both, 7 days before."
- AC: "Given a subscription expiring in 7 days, when the daily job runs, then the owner receives one email and one push in their selected language."
