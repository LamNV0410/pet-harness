# Work items

One folder per work item: `WI-NNN-<slug>/`. Number them sequentially and never reuse a number.

| File | Stage | Written by |
|---|---|---|
| `brief.md` | Requirements; its first line is the status line | BA Agent |
| `design.md` (+ `review-<date>.md`) | Design, if needed | Architect Agent |
| `test-cases.md` | Test design (in parallel with design, after gate 1) | Tester |
| `plan.md` | Planning | Architect / Orchestrator |
| `tasks/Tn.md` | Task reports | BE / FE Agent |
| `test-report.md` | Verification | Tester |
| `release-review.md` | Release review | Release Manager |

Create a file only when its stage is reached. The workflow and approval gates are in `docs/standards/agent-design.md`.
