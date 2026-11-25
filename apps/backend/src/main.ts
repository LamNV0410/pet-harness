// Harness backend entry point (design.md §5 startup sequence).
// 1 open DB + migrate · 2 session token · 3 policy + adapters · 4 system.started · 5 listen on 127.0.0.1
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "./api/index.js";
import { runRoutes } from "./api/runs.js";
import { loadOrCreateToken } from "./api/security.js";
import { ApprovalService } from "./approvals/index.js";
import { loadConfig } from "./config/index.js";
import { Logger } from "./logger.js";
import { PermissionEngine } from "./permissions/engine.js";
import { redact } from "./permissions/redactor.js";
import { ProjectRegistry } from "./projects/index.js";
import { detectToolchains } from "./runtime/process.js";
import { Runner } from "./runtime/runner.js";
import { Store } from "./store/index.js";
import { ToolService } from "./tools/service.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.home, redact, false);
  const store = new Store(
    join(config.home, "harness.db"),
    config.migrationsDir,
    config.testMode,
    redact,
  );
  const token = loadOrCreateToken(config.home);
  const engine = new PermissionEngine(config.policyDir);
  engine.loadPolicy();
  const projects = new ProjectRegistry(store, engine, config.adaptersDir, config.harnessRoot);
  const loaded = projects.load();
  const tools = new ToolService(store, engine, projects, logger);
  const approvals = new ApprovalService(store);
  approvals.expireAllPending();
  const runner = new Runner(store, projects, approvals, logger, detectToolchains(), config.home);
  runner.recover();

  let port = config.port;
  const app = buildApp({
    config,
    store,
    projects,
    tools,
    logger,
    token,
    port: () => port,
    modules: [runRoutes(runner, approvals)],
  });
  await app.listen({ host: "127.0.0.1", port: config.port });
  const addr = app.server.address();
  if (addr && typeof addr === "object") port = addr.port;

  writeFileSync(
    join(config.home, "runtime.json"),
    JSON.stringify(
      { port, pid: process.pid, startedAt: new Date().toISOString(), dev: config.dev },
      null,
      2,
    ),
  );
  store.transaction((tx) => tx.emit("system.started", "system", { version: config.version }));
  logger.info("started", {
    port,
    projects: loaded.projects.length,
    rejectedAdapters: loaded.rejected.length,
  });
  console.log(
    `Furwatch Harness ${config.version} listening on http://127.0.0.1:${port}${config.dev ? " (dev)" : ""}`,
  );
  console.log(
    `Projects: ${loaded.projects.map((p) => `${p.id} [${p.status}]`).join(", ") || "none"}`,
  );
  if (loaded.rejected.length)
    console.log(`Rejected adapters: ${loaded.rejected.map((r) => r.file).join(", ")}`);

  const shutdown = async () => {
    await app.close();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error("Harness failed to start:", (err as Error).message);
  process.exit(1);
});
