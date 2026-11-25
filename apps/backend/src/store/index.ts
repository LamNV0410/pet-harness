// SQLite store on node:sqlite (DS-1). The only module that touches the database.
// State changes and their events are written in ONE transaction; listeners are notified only after
// COMMIT (design.md §5.2, TD-08). A test-only fault hook proves atomicity (OQ-3).
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EventPayload, EventType, HarnessEvent } from "@harness/shared";

export type FaultPoint = "afterStateWrite" | "beforeCommit";

export interface Tx {
  readonly db: DatabaseSync;
  emit<T extends EventType>(
    type: T,
    actor: string,
    payload: EventPayload<T>,
    opts?: { correlationId?: string; causationId?: number },
  ): number;
  /** Call right after the state write; throws only when a matching test fault is armed. */
  checkpoint(point: FaultPoint): void;
}

type Listener = (event: HarnessEvent) => void;

interface EventRow {
  id: number;
  ts: string;
  type: string;
  actor: string;
  correlation_id: string;
  causation_id: number | null;
  payload: string;
}

export class Store {
  readonly db: DatabaseSync;
  private readonly listeners = new Set<Listener>();
  private armedFault: FaultPoint | null = null;

  constructor(
    file: string,
    migrationsDir: string,
    private readonly testMode: boolean,
    private readonly redact: (value: unknown) => unknown,
  ) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    this.migrate(migrationsDir);
  }

  /** Test-only (NODE_ENV=test). Ignored otherwise. */
  armFault(point: FaultPoint | null): void {
    if (this.testMode) this.armedFault = point;
  }

  private migrate(dir: string): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const done = new Set(
      (this.db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map(
        (r) => r.name,
      ),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(dir, f), "utf8");
      this.db.exec("BEGIN");
      try {
        this.db.exec(sql);
        this.db
          .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
          .run(f, new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
      }
    }
  }

  transaction<T>(fn: (tx: Tx) => T): T {
    const committed: HarnessEvent[] = [];
    const insert = this.db.prepare(
      "INSERT INTO events (ts, type, actor, correlation_id, causation_id, payload) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const tx: Tx = {
      db: this.db,
      emit: (type, actor, payload, opts) => {
        const ts = new Date().toISOString();
        const safePayload = this.redact(payload);
        const correlationId = opts?.correlationId ?? "system";
        const causationId = opts?.causationId ?? null;
        const res = insert.run(
          ts,
          type,
          actor,
          correlationId,
          causationId,
          JSON.stringify(safePayload),
        );
        const id = Number(res.lastInsertRowid);
        committed.push(
          toEvent({
            id,
            ts,
            type,
            actor,
            correlation_id: correlationId,
            causation_id: causationId,
            payload: JSON.stringify(safePayload),
          }),
        );
        return id;
      },
      checkpoint: (point) => this.fire(point),
    };
    this.db.exec("BEGIN IMMEDIATE");
    let result: T;
    try {
      result = fn(tx);
      this.fire("beforeCommit");
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    for (const e of committed) for (const l of this.listeners) l(e);
    return result;
  }

  private fire(point: FaultPoint): void {
    if (this.testMode && this.armedFault === point) throw new Error(`test fault: ${point}`);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  listEvents(since: number, limit: number): HarnessEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?")
      .all(since, limit) as unknown as EventRow[];
    return rows.map(toEvent);
  }

  maxEventId(): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM events").get() as {
      m: number;
    };
    return Number(row.m);
  }

  ping(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}

function toEvent(r: EventRow): HarnessEvent {
  const base = {
    id: Number(r.id),
    ts: r.ts,
    type: r.type,
    actor: r.actor,
    correlationId: r.correlation_id,
    payload: JSON.parse(r.payload) as unknown,
  };
  return (
    r.causation_id === null ? base : { ...base, causationId: Number(r.causation_id) }
  ) as HarnessEvent;
}
