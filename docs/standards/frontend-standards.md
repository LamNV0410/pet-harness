# Frontend Standards

**Owner:** FE Agent.
**Scope:** `../furwatch-app` (product) and `apps/frontend` (Harness).
**Also read:** `coding-standards.md` (general), `contracts.md` (API contracts), `security-policy.md`.
**Facts:** `docs/discovery/frontend.md`.

## 1. Boundaries
- **The FE Agent edits only:**
  - `apps/frontend/` and frontend test files;
  - `../furwatch-app/`, on product task branches;
  - `packages/shared/`, only when the plan names the FE Agent as owner of a contract task.
- **Never touch backend code.** If the frontend needs an API that doesn't exist, raise a new task through the Orchestrator.
- **Use only what a contract declares** (`contracts.md` §1). Before the backend task is done, work against mocks built from the shared types, kept in test code only.
- **`furwatch-app` can't be built locally yet** (open decision D1). Until the PO restores it, read the source with `git show origin/dev_v3:<path>`, and stop before implementing.

## 2. furwatch-app (Angular 18 / Ionic 8)
| Topic | Convention |
|---|---|
| API access | Add API calls to a service that extends `services/base/base.service.ts` and uses its V2 methods. Don't add new callers of the legacy `ApiService.get/post` family. |
| Headers / errors | No per-call auth headers or error toasts: the interceptor (`services/httpConfig.interceptor.ts`) owns them. To opt out, use the existing `SKIP_LOADING` / `SKIP_ERROR_TOAST` contexts. |
| State | Services with signals or BehaviorSubject. Don't add NgRx or another state library without a technical decision (TD). |
| Pages | Lazy-loaded NgModule pages under `ui-pages/<area>/`, following the existing module and routing pattern. Use components from `components/` (rfr-*, base-*) before writing new ones. |
| UI text | All user-visible text goes through `@ngx-translate` keys. Add each key to every language file in `src/assets/translation/langs/`. |
| Types | No new `any` in changed code. Add or extend models in `shared/models`. |
| Logging | No new `console.log`. |
| Tests | Real assertions in the `*.spec.ts` next to the changed file. Generated "should create" specs don't count as coverage. |
| Packages | No new npm package without PO approval. There is no lockfile (discovery `frontend.md` §1). |
| Generated files | Don't edit `android/`, `ios/`, `www/`, `dist/` or plugin `example-app/` folders. Change `capacitor.config.ts` or the plugin config instead. |
| Environments | Never point a local run at the beta or prod `apiEndpoint` without PO approval. |

## 3. Harness `apps/frontend`
The stack is undecided (D4), so no code goes here until the Technical Blueprint is approved. These rules apply whatever the stack:
- Use API types and errors only from `packages/shared`. Never redefine them locally.
- Read the backend base URL from configuration; never hardcode it.
- Handle the single shared error shape in one place, not per call.
- Never import from `apps/backend`.
- Language-specific conventions will be added here after D4.

## 4. Evidence
| Area | Required (from the task branch) |
|---|---|
| furwatch-app | `npm run lint` passes, `npx ng test --watch=false --browsers=ChromeHeadless` passes, and `npm run build` succeeds |
| apps/frontend | Build, lint and test for `apps/frontend`. Commands will be defined with D4. |
