# Discovery — furwatch-app (frontend)

Snapshot: `origin/dev_v3` @ `c5bd45b`, 2026-11-25. Conventions are in `README.md` in this folder. Integration with the API is in `integration.md`.

> **The local checkout cannot be built.** The source exists only in git objects (see `README.md`, Repository state).
> Read it with `git show origin/dev_v3:<path>` or `git grep <pattern> origin/dev_v3`.
> In Git Bash, set `MSYS_NO_PATHCONV=1` first.

## 1. Stack
- **Framework:** Angular ^18 with NgModules and lazy routes, Ionic ^8, Capacitor 6.2.0.
  - RISK (version skew): some Capacitor plugins are on 7.x/8.x, and `@angular/cdk` is ^19.
- **Styling:** Tailwind 3. Angular Material is used for icons only.
- **Language:** TypeScript ~5.4 with `strict`.
- **No lockfile:** `package-lock.json` is gitignored.

## 2. Structure
- **Routing** (`src/app/app-routing.module.ts`): `oh-furwatch/*` is the client app; `admin/*` requires roles `G$SUPER_ADMIN` or `G$SYSTEM_ADMIN`. Both are guarded by `shared/guards/auth.guard.ts`.
- **State:** services with BehaviorSubject and Angular signals. No NgRx.
  - RISK: the JWT is stored in Ionic Storage, AES-encrypted with a hardcoded key (`services/storage.service.ts:3`).
- **HTTP layer:**
  - `services/api.service.ts` has two method families, legacy and V2.
  - `services/base/base.service.ts` is extended by 22 services.
  - One interceptor, `services/httpConfig.interceptor.ts`, adds the Bearer token and the `TimeZone-Offset`, `Currency-Code`, `Platform` and `Version` headers. A 401 logs the user out; there is no token refresh.
- **Environments** (`src/environments/`): `apiEndpoint` differs per file.

  | Environment | `apiEndpoint` |
  |---|---|
  | Local (`environment.ts`) | http://localhost:7149/api |
  | Local (`environment.dev.ts`) | https://localhost:7149/api |
  | Beta | `api-beta.ohfurwatch.com/api` |
  | Prod | `api.ohfurwatch.com/api` |

- **Native:** six local Capacitor plugins at the repo root: Minew BLE, background location, device calendar, Live Activity, and others.

## 3. Runtime and testing
| Step | Command (from `furwatch-app/`, once the source is restored) |
|---|---|
| Install | `npm install --legacy-peer-deps` (as in the Dockerfile; needs PO approval) |
| Build | `npm run build` (prod) / `npm run build:dev` |
| Test | `npx ng test --watch=false --browsers=ChromeHeadless`. Needs Chrome; UNKNOWN whether it's installed |
| Lint | `npm run lint` |
| Run | `npm run dev`, then open http://localhost:4200 |
| Health | `GET /` |

- **Existing tests:** 53 Karma/Jasmine specs, 45 of them generated boilerplate. No e2e tests.
- **Karma defaults:** headed Chrome with `singleRun: false`, so plain `npm test` never exits.
- **Windows:** scripts with an `APP_ENV=` prefix (native and beta builds) fail in PowerShell.

## 4. Risks (RISK)
- **Committed secrets:**
  - environment files
  - the Google Maps key in `src/index.html`
  - `firebase-messaging-sw.js`
  - the API-key header in `auth.service.ts`
  - the native Google config files

  Rotate these, don't just delete them: the values stay in git history.
- **Firestore rules:** `petEvents` is not tenant-scoped.
- **Code health:** `maps.page.ts` is 1535 lines.
- **Reproducibility:** no lockfile, and peer dependencies conflict.

## 5. Known-stale documentation
- `furwatch-app/CLAUDE.md` lists `build:test` and `at` scripts that don't exist.

## 6. Open questions (UNKNOWN)
1. Which branch is authoritative (`origin/dev_v3`, `origin/minew-report` or a release branch). This is decision D1.
2. Whether `npm install` resolves reproducibly without a lockfile.
