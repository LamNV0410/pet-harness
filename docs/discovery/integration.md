# Discovery — app ↔ API integration

Snapshot: 2026-11-25. Conventions are in `README.md` in this folder. Paths are prefixed `api:` (furwatch-api) or `app:` (furwatch-app).

## 1. How they connect (VERIFIED unless marked)
| Topic | Finding |
|---|---|
| Base URL | `apiEndpoint` always ends in `/api`. Hubs replace `/api` with `/hubs/<name>` |
| Auth | Backend JWT plus `session_id`. On startup the app calls `usersession/validate` with `X-Session-Id`. The Firebase custom token is refreshed every 45 min via `user/firebase-token` |
| SignalR | `/hubs/notifications`. Token passed in the query string, WebSockets with `skipNegotiation` |
| CORS | `api:Extensions/CorsExtensions.cs`. Any origin in DEBUG builds; `Cors:Origins` in Release |
| Contracts | No shared DTOs and no OpenAPI codegen. Frontend models are written by hand |

## 2. Known mismatches
| Topic | Finding |
|---|---|
| Token refresh | The backend has `user/auth/refresh`, but the frontend refresh code is commented out |
| 426/430/503 | The frontend handles these codes. The backend's `SuspendedUserFilterAttribute` that produces them is **not applied** (`api:Controllers/BaseController.cs:16`) |
| Error body | The frontend reads `error.errors` and `error.error.message`. `ExceptionMiddleware` serializes PascalCase (`api:Abstractions/ExceptionMiddleware.cs:59`), so exception messages fall back to a generic toast |
| Local port/scheme | `npm run dev` expects https on 7149, but the `http` profile serves plain http on 7149. INFERRED mismatch |

## 3. Cross-cutting risks (RISK)
- Secrets are committed in both repos. See `backend.md` §8 and `frontend.md` §4.
- A contract change has to be made by hand on both sides, because there is no shared contract package.
