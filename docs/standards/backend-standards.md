# Backend Standards

**Owner:** BE Agent.
**Scope:** `../furwatch-api` (product) and `apps/backend` (Harness).
**Also applies:** `coding-standards.md` (general), `contracts.md` (API contracts), `security-policy.md`.
**Facts:** `docs/discovery/backend.md`.

## 1. Boundaries
- **The BE Agent edits only:**
  - `apps/backend/`, and backend test files;
  - `../furwatch-api/` on product task branches;
  - `packages/shared/`, only when the plan names it as owner of a contract task.
- **Never touch UI code.** If the frontend needs something, raise a new task through the Orchestrator.
- **Contracts:** the BE Agent is the provider for every API contract. Implement contracts exactly as defined (`contracts.md` §1).

## 2. furwatch-api (.NET 8)
Follow the patterns that already exist. Introducing a new pattern needs a technical decision (TD).

| Topic | Convention |
|---|---|
| Endpoint | Add it to the existing controller for that resource. Use `[Authorize]`, plus `Roles=` for admin actions. **Never add an anonymous endpoint without PO approval.** |
| Controller body | Keep it thin: read identity via `SetUserIdentity()`, call a service, return `CustomResult(result)` |
| Business logic | Put it in a service under `UrKnightAPI/Services/` that returns `Result<T>` / `Result`. Add errors to the matching catalogue in `UrKnightAPI.Core/Errors/`. Don't throw for expected failures. |
| Request/response models | `UrKnightAPI.Core/RequestModel` and `UrKnightAPI.Core/ResponseModel`. Pagination uses `BasePaginationRequest` / `PaginationResponseModel<T>` |
| Data access | Prefer `IRepositoryWrapper` and `SaveChangeAsync()`. Some existing code uses `ApplicationContext` directly; don't spread that to new controllers. |
| Soft delete | Filter `IsDeleted` explicitly. There are no global query filters. |
| Schema change | Add a new migration with `dotnet ef migrations add <Area>_<NNN>_<Change>` (the existing naming). Needs PO approval. Never edit an applied migration. |
| Async | No `async void`, no `.Result`/`.Wait()`, no new fire-and-forget `Task.Run` |
| Logging | Use `ILogger<T>` with message templates. No `Console.WriteLine`. Never log tokens, OTPs, emails or request bodies. |
| Tests | Add or extend xUnit tests in `UrKnightAPI.Tests/<Area>/`, using EF InMemory and the existing `Fake*` classes. Tests must not use the network. |
| Generated files | `*/Migrations/*.Designer.cs` and `ApplicationContextModelSnapshot.cs` are changed only by `dotnet ef` |
| Running the API | Needs PO approval for every start. Only the Development profile, on the dev/test database (TD-13). Startup seeds data, starts Hangfire and downloads Chromium (discovery `backend.md` §2) |

## 3. Harness `apps/backend`
The stack is undecided (D4). Until the Technical Blueprint is approved, no code goes here. These rules apply whatever the stack turns out to be:
- Every endpoint, request/response type, error and event is defined in `packages/shared` first. Don't define API types locally.
- Return the single shared error shape for every failure, with consistent status codes. This avoids the error-format mismatch documented in `docs/discovery/integration.md` §2.
- The backend owns authentication, CORS and input validation for its API.
- Never import from `apps/frontend`. Never import Furwatch product code: use their CLIs, files and HTTP APIs.
- Language-specific conventions will be added here after D4.

## 4. Evidence
| Area | Required (from the task branch) |
|---|---|
| furwatch-api | `dotnet build UrKnightAPI.sln` succeeds with no new warnings in the changed projects, and `dotnet test UrKnightAPI.sln` passes |
| apps/backend | Build, lint and test for `apps/backend`, plus contract tests in `tests/contract/` for any changed contract. Commands to be defined with D4 |
