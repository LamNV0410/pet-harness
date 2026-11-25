# WI-003 M3 Agent loop (read-only) — design note
Status: gates 1–3 under PO standing delegation (`open-decisions.md`, 2026-11-25).

- Executor: `apps/backend/src/agents/executor.ts` spawns `claude -p --output-format stream-json` per agent run in a worktree, with a generated settings file whose PreToolUse **HTTP hook** posts every tool call to `/api/hooks/pretooluse?run=<id>` (`onFailure: block` → fails closed). `--max-turns` and a wall-clock timeout are the budget. Usage (tokens, cost, turns) is stored on `agent_runs`.
- Policy: `agents/hook.ts` — reads only inside the run's roots, secrets denied, writes only for BE/FE in their task worktree, all other tools (shell, web, subagents) denied. Every decision is a `tool.requested`/`tool.decided` event.
- Fake executor: `scripts/fake-claude.mjs`, selected with `HARNESS_CLAUDE_BIN`. Same argv and stream-json; calls the hook.
- BA run: Inbox item → read-only worktree from `baseRef`, secrets stripped → `brief` artifact → gate 1 in the Approval Center.
- UI: Requirement Inbox, Approval Center, agent run detail (activity feed).
- Evidence: `tests/e2e/workflow-fake.mjs`. A real `claude -p` run is not yet recorded (UNKNOWN).
