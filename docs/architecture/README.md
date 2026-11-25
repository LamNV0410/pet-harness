# Architecture — Furwatch Harness Technical Blueprint

**Status:** Blueprint v0.2 was **ACCEPTED** by the PO at gate 2 on 2026-11-25 (TD-01 to TD-11).
- Decisions still OPEN are listed in `open-decisions.md`. Don't treat them as decided.
- Each implementation phase still needs its own approvals (installs, `git init`, provider use).

| Doc | Content |
|---|---|
| `01-system-architecture.md` | Context, the Harness vs. product boundary, containers, BE/FE/shared structure |
| `02-agent-architecture.md` | Roles, the agent run model, context isolation, audit, cost optimization |
| `03-orchestrator-workflow.md` | Work-item state machine, gates, task DAG, retries, worktrees, recovery |
| `04-tool-runtime-and-security.md` | Tool runtime, least-privilege grants, permission engine, secrets, adapters |
| `05-data-model-and-events.md` | State tables, event envelope and catalog, SSE delivery |
| `06-virtual-office-architecture.md` | Event-driven Virtual Office (no LLM calls) |
| `07-implementation-roadmap.md` | Phases M0–M6, blockers, recommended next phase |
| `08-technical-decisions.md` | TD-01 … TD-11: options, trade-offs, proposals |
| `open-decisions.md` | Status of D1–D15 (OPEN / PROPOSED / ACCEPTED) |

## Rules for these documents
- **Labels.** Mark facts as VERIFIED, INFERRED or UNKNOWN. Mark designs as PROPOSED. Mark unmade choices as OPEN.
- **No duplication.** Each topic lives in one document. Other documents link to it with `NN §x`.
- **New decisions** go in `08-technical-decisions.md` as a new `TD-NN` with status PROPOSED, and get a row in `open-decisions.md`. Only the PO moves a decision to ACCEPTED, in chat (gate 2). Record the date there.
- **Work-item designs** (`docs/work-items/*/design.md`) follow this blueprint. If a design needs to deviate, propose a TD.
