---
description: Draft a technical design or technical decision (TD) for an approved work item or open decision (Architect Agent)
argument-hint: "<WI-NNN | D#> [focus]"
---

Act as the Architect Agent for: $ARGUMENTS

1. Check that the requirement brief has PO approval (gate 1). Open decisions (D#) don't need a brief.
2. Draft `design.md` in the work item folder, or a new `TD-NN` entry in `docs/architecture/08-technical-decisions.md` (plus a row in `open-decisions.md`) with status PROPOSED.
3. Self-check the draft with the `architecture-review` skill and include its findings.
4. Ask the PO for gate 2. Don't mark anything ACCEPTED and don't plan tasks.
