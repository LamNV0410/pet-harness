# Furwatch Harness

A local-first hybrid AI software development team for the Furwatch products (`../furwatch-api`, `../furwatch-app`).

**Status:** foundation only. No application code yet. The technology stack is open decision D4 (`docs/architecture/open-decisions.md`).

## Layout
| Path | Purpose | Owner |
|---|---|---|
| `apps/backend/` | Harness backend application | BE Agent |
| `apps/frontend/` | Harness frontend application | FE Agent |
| `packages/shared/` | Contracts, types, schemas and interfaces shared by backend and frontend | BE + FE, through the contract process |
| `tests/` | Cross-application integration, contract and end-to-end tests | Tester |
| `docs/discovery/` | Facts about the Furwatch products | All roles (keep current) |
| `docs/architecture/` | Technical Blueprint 01–08, technical decisions, open decisions | Architect (PO approves) |
| `docs/standards/` | Coding, agent workflow and security rules | Orchestrator (PO approves changes) |
| `docs/work-items/` | One folder per work item: brief, design, plan, test report, release review | Per stage |
| `.claude/` | Claude Code settings, skills and `/fw:*` commands | Orchestrator (PO approves changes) |

## Start here
1. Open Claude Code in this folder. The product repos are added as working directories by `.claude/settings.json`.
2. Read `CLAUDE.md`, then `docs/standards/agent-design.md`.
3. Use `/fw:status` to see work in progress and pending approvals.
