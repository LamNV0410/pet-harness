# Discovery — furwatch-api (backend)

Snapshot: `dev_v3` @ `7e3e66c`, 2026-11-25. Conventions are in `README.md` in this folder. Integration with the app is in `integration.md`.

## 1. Solution layout
`UrKnightAPI.sln` contains 6 projects, all targeting `net8.0`. The API project references Core, Entities, Repositories and Worker.

| Project | Role |
|---|---|
| `UrKnightAPI/` | Host (`Program.cs`), 41 controllers, the SignalR hub, **most business logic** in `Services/`, Hangfire job classes in `Workers/`, seeders, Email/PDF templates |
| `UrKnightAPI.Core/` | DTOs, `Result<T>`/`Error` (`Core/Result/Result.cs`, `Core/Errors/Error.cs`), blob storage, options |
| `UrKnightAPI.Entities/` | `Models/ApplicationContext.cs` (96 DbSets) and 33 EF migrations (`20260702025048_Initial` → `20261119075433_LifeEvent_003_RecurrenceChain`) |
| `UrKnightAPI.Repositories/` | `RepositoryWrapper` acting as unit of work, plus 17 repositories. Services often bypass it (`GetDbContext()` is used 110×) |
| `UrKnightAPI.Worker/` | Hangfire setup. It is a class library that runs **inside the API process** |
| `UrKnightAPI.Tests/` | xUnit 2.5.3 with EF InMemory: 27 files, ~153 tests, hand-written fakes |

**Key packages:**

| Package | Version / note |
|---|---|
| EF Core with SQL Server | 9.0.0 |
| Hangfire | 1.8.23 |
| FirebaseAdmin | 3.1.0 |
| JwtBearer | 6.0.29. RISK: a 6.x package on net8 |
| Swashbuckle | 6.4.0 |
| PuppeteerSharp | 25.1.2 |
| Scriban | Email and PDF templates. `CLAUDE.md` wrongly says Handlebars |
| WindowsAzure.Storage | 9.3.3, deprecated |

## 2. Startup (`UrKnightAPI/Program.cs`), VERIFIED
1. **Auth:** JWT bearer with an HMAC key (`Audience:*`). Hubs also accept the token via the `access_token` query.
2. **CORS:** any origin in **DEBUG builds**. In Release it uses `Cors:Origins` (`Extensions/CorsExtensions.cs`).
3. **Swagger:** runs in all environments.
4. **Hangfire dashboard:** at `/hangfire`.
5. **Seeding:** every boot runs **`DbSeeder` and backfills** (`:175-177`).
6. **Chromium:** `PuppeteerSetupService` **downloads Chromium** on boot.
7. **Firebase:** init **throws if the service-account file is missing**.
8. **Not present:** health checks, HTTPS redirection (commented out), structured logging.

## 3. API conventions
- **Routes:** `api/[controller]`, plus nested routes like `api/pets/{petId}/…`.
- **Responses:** `Result<T>`, mapped to HTTP by `BaseController.CustomResult`. Shape: `{ isSuccess, error: { code, message, type, errors? }, value }`. Some legacy controllers return raw `Ok`/`BadRequest(string)`.
- **Pagination:** `BasePaginationRequest` (0-based page, max size 30) or cursor-based.
- **Realtime:** one hub at `/hubs/notifications` (`Hubs/Notifications/NotificationHub.cs`).

## 4. Background jobs (`Worker/Schedules/Base/JobRegistrationService.cs`)
| Job | Schedule |
|---|---|
| `event-reminder` | Daily |
| `subscription-expiry-reminder` | Daily |
| `life-event-reminder` | Every 5 min |
| `outdoor-mode-reminder` | Hourly |

All four send real FCM push, email and hub messages.

## 5. External services (confirmed in code)
| Service | Location / notes |
|---|---|
| HitPay | `Services/factories/bases/Payments/HitPayProvider.cs`; webhook HMAC check |
| Firebase | FCM, Firestore, RTDB REST, custom tokens |
| Azure Blob | `Core/BlobStorage/BlobServices.cs` |
| SMTP (MailKit) | — |
| Google and Apple SSO | — |
| RapidAPI weather | — |
| MaxMind GeoLite2 | Local `.mmdb` file |

SendGrid and Ant Media appear only in config or models.

## 6. Configuration (key names only)
- **Files:** `UrKnightAPI/appsettings*.json`.
- **Sections:** `Sqlconnection`, `Audience`, `AppSettings`, `SystemSetting`, `MailSettings`, `Email`, `Cors`, `FireBase`, `HitPay`, `PaymentGateway`, `Google`, `Apple`, `Hangfire`, `PdfSettings`, `Puppeteer`, `Crypto`, `WeatherSettings`.
- **Overrides:** environment variables, e.g. `Sqlconnection__ConnectionString`.
- **Ports** (`Properties/launchSettings.json`):

| Profile | URL |
|---|---|
| `http` | http://localhost:7149 |
| `https` | https://localhost:7149 and http://localhost:5196 |

## 7. Runtime and testing
| Step | Command (from `furwatch-api/`) |
|---|---|
| Install | `dotnet restore UrKnightAPI.sln` |
| Build | `dotnet build UrKnightAPI.sln` |
| Test | `dotnet test UrKnightAPI.sln` — INFERRED side-effect-free (InMemory DB, fakes) |
| Lint | None configured |
| Run | `dotnet run --launch-profile https` from `UrKnightAPI/`. **Side effects: see §2.5–2.7 and §4** |
| Health | None. Use `GET /swagger/v1/swagger.json` |

## 8. Risks (RISK)
- **Committed secrets:** all `appsettings*.json` (incl. Prod), `ServiceAccounts/serviceAccount.json`, `Keys/*.p8`. Rotate them, don't just delete them: the values stay in git history.
- **Unauthenticated write endpoints:** `BeaconController` add/assign-tenant, `TestController`, `FirestoreController` upload-bulk.
- **Public blob containers:** `BlobServices.cs:41-42`.
- **Exposed in all environments:** Swagger and the Hangfire dashboard.
- **Forwarded headers:** trusted from any proxy.
- **IDOR:** hub `SubscribeNotification` does not check the caller.
- **Local runs are unsafe without isolation:** Dev and Stg config point at the **same remote database**, and startup seeding plus Hangfire jobs run on every boot.
- **Code health:** `Services/IPetV2Service.cs` is 2462 lines; about 2,200 commented-out lines; two fully commented-out controllers.

## 9. Known-stale documentation
- `furwatch-api/CLAUDE.md`:
  - says Handlebars; it's Scriban;
  - understates test coverage;
  - describes the Worker as a separate service.
- `furwatch-api/.claude/skills/backend-test/SKILL.md` says no test project exists. One does.

## 10. Open questions (UNKNOWN)
1. Whether migrations apply cleanly to an empty LocalDB. Hangfire tables are also in the EF model.
2. Whether Hangfire and seeding can be disabled without a code change.
