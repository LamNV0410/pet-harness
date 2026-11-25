# WI-004 M4 Write path — design note
Status: gates 1–3 under PO standing delegation.

- Architect run emits a ```harness-tasks``` JSON block → `tasks` rows (single-repo DAG, run in order).
- Each task: branch `fw/<task>` in a dedicated worktree from `baseRef`; BE/FE agent gets Edit/Write (hook limits them to that worktree); Harness commits (`commitAll`). Nothing is pushed.
- Diff view: `GET /api/workitems/:id/diff` (base..commit per task). Agent report stored as `report-<task>` artifact.
- Evidence: e2e reaches a committed task branch with build/test verdicts.
