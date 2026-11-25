// JSON-lines logger to HARNESS_HOME/logs/backend.log (OQ-14). Never logs tool content or tokens;
// every record passes through the redactor as a last line of defence.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "info" | "warn" | "error";

export class Logger {
  private readonly file: string;

  constructor(
    home: string,
    private readonly redact: (v: unknown) => unknown,
    private readonly echo: boolean,
  ) {
    const dir = join(home, "logs");
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "backend.log");
  }

  log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    const record = this.redact({ ts: new Date().toISOString(), level, msg, ...fields });
    const line = JSON.stringify(record);
    try {
      appendFileSync(this.file, `${line}\n`);
    } catch {
      // logging must never break the request
    }
    if (this.echo) console.log(line);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.log("info", msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.log("warn", msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.log("error", msg, fields);
  }
}
