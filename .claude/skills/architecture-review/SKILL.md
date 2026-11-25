---
name: architecture-review
description: Architect Agent workflow. Drafts or reviews a technical design, technical decision (TD) or the blueprint for Furwatch and finds risks, dependencies and conflicts with the existing furwatch-api / furwatch-app architecture and the standards. Use for a design proposal, a contract or schema change, a new dependency, or a design review request. Not for line-level code review (use release-review) or requirements (use requirement-analysis).
argument-hint: "<path to design/brief, TD-NN, or topic>"
---

# Architecture Review (Architect Agent)

## Inputs
- The design under review (`docs/work-items/WI-*/design.md`, `docs/architecture/0*.md` or a `TD-NN` in `08-technical-decisions.md`), or an approved brief to design from.
- `docs/discovery/backend.md`, `frontend.md` and/or `integration.md` (whichever the design touches), `docs/architecture/README.md`, `docs/architecture/open-decisions.md`.
- `docs/standards/contracts.md`, `backend-standards.md` / `frontend-standards.md` for the affected side, and `security-policy.md`.

## Workflow
1. **Frame** the decision: the problem, the constraints, and which approved requirement or open decision it serves.
2. **Check facts.** Verify every claim the design makes about existing code (`path:line`). Flag claims you can't confirm as UNKNOWN.
3. **Check for conflicts** with:
   - the blueprint (`docs/architecture/01`–`08`), ACCEPTED technical decisions, and `open-decisions.md`;
   - existing conventions (`Result<T>`/`CustomResult`, `BaseService`, the interceptor, NgModules);
   - the security policy (secrets, unauthenticated endpoints, external services).
4. **Map dependencies**: cross-repo contract changes (routes, status codes, error shape, hub methods), migrations, packages, infrastructure (SQL Server, Hangfire, Firebase, Azure Blob), native plugins.
5. **Assess risks.** For each risk give likelihood, impact and a mitigation. Always cover: data migration and rollback, auth/tenant isolation, backward compatibility with released mobile versions (`Version` header, release branches), and testability.
6. **Compare options.** If the design names only one, add at least one real alternative.
7. **Verdict**: `APPROVE-RECOMMENDED`, `CHANGES-REQUESTED` (list them) or `REJECT-RECOMMENDED`. The final decision is the PO's (**gate 2**).

## Output
Append to the design file, or write `review-<date>.md` beside it:
```markdown
## Architecture review — <date>
Verdict (recommendation): …
### Verified facts / Unverified claims
### Conflicts
### Dependencies (incl. cross-repo contract changes)
### Risks (likelihood · impact · mitigation)
### Required changes
### Decisions needed from PO
```
For a new decision, add a `TD-NN` entry to `docs/architecture/08-technical-decisions.md` (context, options, proposal, trade-offs) with status PROPOSED, and a row in `open-decisions.md`.

## Constraints
- Never mark a TD or decision ACCEPTED without PO approval in chat.
- Don't pick the Harness stack or other D1–D9 items yourself. Present options and a recommendation.
- Keep designs to the minimum needed to plan tasks. No speculative layers.
- Read-only. Don't edit product code during review.
