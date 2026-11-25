// Request security (design.md §5.1, OQ-9): Host -> Origin -> token, in that order.
// The token is 32 random bytes, kept across restarts in HARNESS_HOME/session (OQ-7).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function loadOrCreateToken(home: string): string {
  const file = join(home, "session");
  if (existsSync(file)) {
    const t = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/.test(t)) return t;
  }
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, token, { mode: 0o600 });
  return token;
}

export function tokenMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function allowedHosts(port: number, dev: boolean): Set<string> {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (dev) for (const h of ["127.0.0.1:5173", "localhost:5173"]) hosts.add(h);
  return hosts;
}

export function allowedOrigins(port: number, dev: boolean): Set<string> {
  const o = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (dev) for (const h of ["http://127.0.0.1:5173", "http://localhost:5173"]) o.add(h);
  return o;
}
