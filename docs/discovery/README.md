# Discovery — Furwatch products

Snapshot of a read-only investigation on **2026-11-25**.

| File | Covers | Main reader |
|---|---|---|
| `backend.md` | `furwatch-api` (.NET 8) — structure, runtime, tests, risks | BE Agent |
| `frontend.md` | `furwatch-app` (Angular/Ionic/Capacitor) — structure, runtime, tests, risks | FE Agent |
| `integration.md` | How app and API talk, known mismatches, cross-cutting risks | Architect, BE, FE, Tester |

Conventions for all three files:
- **Labels:** VERIFIED (read in source), INFERRED, UNKNOWN, RISK.
- **Paths** are relative to the repository named in each file.
- **No secret values.** Config is referenced by key name only.
- **Keep them current.** Any role that finds a fact is wrong corrects it in place (for example during `/fw:discover`). Don't create parallel reports.

## Repository state

| | furwatch-api | furwatch-app |
|---|---|---|
| Remote | gitlab.com `ledgerxdev/furwatch-api` | gitlab.com `ledgerxdev/furwatch-app` |
| Snapshot | `dev_v3` @ `7e3e66c` (in sync with origin) | `origin/dev_v3` @ `c5bd45b` |
| On disk | Full source | Local `main` is a GitLab template. **Source is missing on disk** (no `package.json`, `src/`, `tsconfig*`). VERIFIED |
| Other branches | `release/v1.0.0` … `release/v1.2.2` | Same release pattern (prod `version` 1.2.2). `origin/minew-report` is 3 commits ahead with a new signal-strength page |
| CI config | None found. UNKNOWN how builds are produced | None found |

## Local machine
.NET SDK 10.0.401 with the 8.0.31 runtime, Node 20.20.1, SQL LocalDB and `dotnet-ef`. Docker and Java are not installed.

## Shared open questions (UNKNOWN)
1. How production is built and deployed (no CI files in either repo).

Area-specific open questions are listed at the end of each file.
