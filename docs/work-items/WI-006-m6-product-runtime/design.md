# WI-006 M6 Product runtime — design note
Status: gates 1–3 under PO standing delegation. **Each start still needs PO approval** (TD-13).

- `runtime/servers.ts`: start `furwatch-api` (Development profile) only after an approval that lists the side effects (seeds DB, Hangfire jobs, Chromium download). Health probe, maximum runtime then automatic stop, stop on Harness shutdown. Start/stop/health are audited events.
- API: `GET /api/servers`, `POST /api/servers/:id/start|stop`. UI: Runtime view.
- Evidence: not started in this change — a start needs the PO's approval in the UI (UNKNOWN until then).
