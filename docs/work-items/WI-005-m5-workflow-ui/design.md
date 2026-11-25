# WI-005 M5 Workflow + UI suite — design note
Status: gates 1–3 under PO standing delegation.

- State machine (`workflow/engine.ts`): inbox → analysis → gate1 → design → gate2 → build → verify → gate4 → done | cancelled. Gates are approvals; deny/retry takes a PO note back to the agent.
- Verify: adapter `install/build/lint/test` in each task worktree via the M2 runner; `approval: ask` commands raise an approval.
- Crash resume: `Workflow.recover()` fails interrupted agent runs and re-raises the gate approval; Retry reruns the stage.
- UI: Dashboard, Kanban, Work item detail (artifacts, tasks, diff), Virtual Office (D14, live agent activity).
- Out of scope now: parallel tasks and the `rc/WI-NNN` branch (tasks run sequentially; PO merges the task branches). RISK: noted for a later WI.
