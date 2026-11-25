---
description: Read-only summary of work items, pending PO approvals and open decisions
argument-hint: "[WI-NNN]"
---

Act as the Orchestrator. Report status, read-only, for: $ARGUMENTS (all work items if empty)

1. For each `docs/work-items/WI-*/`: the status line from `brief.md`, which stage files exist, and the recorded approvals.
2. For each task branch `fw/WI-*` in `furwatch-api` and `furwatch-app`: last commit and ahead/behind its base.
3. Open decisions from `docs/architecture/open-decisions.md`.
4. A table of **what is waiting on the PO** (gate and item), then what each role can do next without the PO.

Report the status lines as written. Don't change any file or status.
