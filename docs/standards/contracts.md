# Contracts and Integration

Covers everything that crosses the backend/frontend boundary. Applies to the Architect, BE Agent, FE Agent and Tester.

## 1. Harness API contracts (`packages/shared`)
- **Single source of truth.** `packages/shared` defines everything that crosses the boundary: endpoints, request and response types, the error shape, events/messages, and enums.
- **Contract-first.** Define a new or changed API in `packages/shared` before either side implements it.
- **Rules for both sides:**
  - The backend implements contracts exactly.
  - The frontend uses only what a contract declares.
  - Neither side redefines a shared type locally. Use it as is, or extend it through the contract process.
- **One error shape** for all endpoints, defined once in `packages/shared`. Today the products disagree on error format and status codes (see `docs/discovery/integration.md` §2).
- **Types of contract change:**

  | Kind | Examples | What it needs |
  |---|---|---|
  | Additive (non-breaking) | New optional field, new endpoint, new enum value the consumer can ignore | Architect review |
  | Breaking | Field renamed or removed, type change, new required field, status code changes meaning | Architect review, **PO gate 2**, and a migration note in `design.md` saying how both sides switch over |

- The format of the contracts (language-native types, a schema language, or both) is still open: decision D10.

## 2. Shared package rules
- **May contain:** types, schemas, interfaces, constants and enums, and small pure helpers for those types (see `packages/shared/README.md`).
- **Must not contain:** I/O, network or database code, framework or UI code, business logic, or secrets. It must not depend on either app or on any runtime framework.
- **Process for each change:**
  1. A proposal in the work item's `design.md`.
  2. Architect review.
  3. A dedicated shared task in `plan.md` with **one named owner**. The default owner is the BE Agent, as the API provider.
  4. The other side's agent reviews the handoff.
  5. Dependent BE and FE tasks start. The contract is frozen for the work item from this point (`agent-design.md` §2.3).
- After a shared change, both apps must still build and pass their tests before the shared task counts as done.

## 3. Backend/frontend integration
- **API only.** The frontend talks to the backend only through the API declared in `packages/shared`. No shared database, filesystem paths or in-process calls.
- **Configuration.** The frontend reads the backend base URL from configuration. The backend owns the CORS and authentication rules for its API.
- **Mocks.** Before integration, the frontend may use mocks built from the shared types. They live in frontend test code only and are never shipped.
- **Verification.** The Tester checks integration in two places:
  - `tests/contract/`: the backend honours each contract;
  - `tests/e2e/`: the two apps work together, on the combined branches of the work item.

## 4. Product cross-repo contracts (`furwatch-api` ↔ `furwatch-app`)
- **What counts as a contract change:** any change to request/response shape, status codes, headers, hub methods or routes. It needs an architecture review and PO approval.
- **Coordinated branches.** Update both sides in branches with matching task IDs, API first. Mobile apps already released still call the API, so keep it backward-compatible or get the PO to approve the cutover.
- **Record the contract** in the task's design note. The products have no shared DTO package. Known mismatches are in `docs/discovery/integration.md` §2.
- **No imports.** The Harness never imports product code. It uses the products only through their CLIs, files and HTTP APIs.
