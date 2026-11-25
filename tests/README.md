# tests — cross-application tests

**Owner:** Tester. **Status:** empty. The test tooling is undecided (D4).

| Type | Where |
|---|---|
| Unit tests for one application | Inside that application (`apps/backend`, `apps/frontend`), next to the code |
| Contract tests (backend honours `packages/shared`; frontend consumes only what it declares) | `tests/contract/` |
| Integration and end-to-end tests that run both applications | `tests/e2e/` |
| Test data and fixtures | `tests/fixtures/` (no real credentials or production data) |

Tests here must not touch shared/beta/prod databases or real external services (`docs/standards/security-policy.md` §2).
