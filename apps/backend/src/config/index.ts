// Typed configuration from environment variables (design.md §5, §11 OQ-2).
// HARNESS_PORT (0 = OS picks), HARNESS_HOME, HARNESS_ADAPTERS_DIR, HARNESS_POLICY_DIR; `--dev` flag.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  readonly harnessRoot: string;
  readonly backendRoot: string;
  readonly port: number;
  readonly home: string;
  readonly adaptersDir: string;
  readonly policyDir: string;
  readonly frontendDist: string;
  readonly migrationsDir: string;
  readonly dev: boolean;
  readonly testMode: boolean;
  readonly version: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): Config {
  // compiled location: apps/backend/dist/config/index.js
  const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const harnessRoot = resolve(backendRoot, "..", "..");
  const rawPort = env.HARNESS_PORT ?? "7420";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`HARNESS_PORT must be an integer 0-65535, got "${rawPort}"`);
  }
  const pkg = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
    version?: string;
  };
  return {
    harnessRoot,
    backendRoot,
    port,
    home: resolve(env.HARNESS_HOME ?? resolve(harnessRoot, ".harness")),
    adaptersDir: resolve(env.HARNESS_ADAPTERS_DIR ?? resolve(harnessRoot, "adapters")),
    policyDir: resolve(env.HARNESS_POLICY_DIR ?? resolve(harnessRoot, "policy")),
    frontendDist: resolve(harnessRoot, "apps", "frontend", "dist"),
    migrationsDir: resolve(backendRoot, "migrations"),
    dev: argv.includes("--dev"),
    testMode: env.NODE_ENV === "test",
    version: pkg.version ?? "0.0.0",
  };
}
