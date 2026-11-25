// Generic approvals (command runs now; gates and agent tool asks in M3+). One approval covers
// exactly one action, bound to a hash of its payload, and can be decided once.
import { createHash, randomUUID } from "node:crypto";
import type { Approval } from "@harness/shared";
import type { Store } from "../store/index.js";

interface Row {
  id: string;
  kind: string;
  title: string;
  detail: string;
  effects: string;
  requested_by: string;
  subject_id: string;
  payload_hash: string;
  state: string;
  created_at: string;
  decided_at: string | null;
}

const toApproval = (r: Row): Approval => ({
  id: r.id,
  kind: r.kind as Approval["kind"],
  title: r.title,
  detail: r.detail,
  effects: JSON.parse(r.effects) as string[],
  requestedBy: r.requested_by,
  subjectId: r.subject_id,
  payloadHash: r.payload_hash,
  state: r.state as Approval["state"],
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

type Waiter = (decision: "approved" | "denied") => void;

export class ApprovalService {
  private readonly waiters = new Map<string, Waiter[]>();

  constructor(private readonly store: Store) {}

  request(a: {
    kind: Approval["kind"];
    title: string;
    detail: string;
    effects: string[];
    requestedBy: string;
    subjectId: string;
    payload: unknown;
    correlationId?: string;
  }): Approval {
    const id = randomUUID();
    const payloadHash = createHash("sha256").update(JSON.stringify(a.payload)).digest("hex");
    const now = new Date().toISOString();
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "INSERT INTO approvals (id, kind, title, detail, effects, requested_by, subject_id, payload_hash, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        )
        .run(
          id,
          a.kind,
          a.title,
          a.detail,
          JSON.stringify(a.effects),
          a.requestedBy,
          a.subjectId,
          payloadHash,
          now,
        );
      tx.emit(
        "approval.requested",
        a.requestedBy,
        { approvalId: id, kind: a.kind, title: a.title, subjectId: a.subjectId },
        { correlationId: a.correlationId ?? a.subjectId },
      );
    });
    return this.get(id) as Approval;
  }

  onDecided(id: string, waiter: Waiter): void {
    this.waiters.set(id, [...(this.waiters.get(id) ?? []), waiter]);
  }

  decide(id: string, decision: "approved" | "denied"): Approval | null {
    const current = this.get(id);
    if (!current) return null;
    if (current.state !== "pending") return current;
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "UPDATE approvals SET state = ?, decided_at = ? WHERE id = ? AND state = 'pending'",
        )
        .run(decision, new Date().toISOString(), id);
      tx.emit(
        "approval.decided",
        "po",
        {
          approvalId: id,
          kind: current.kind,
          title: current.title,
          subjectId: current.subjectId,
          decision,
        },
        { correlationId: current.subjectId },
      );
    });
    for (const w of this.waiters.get(id) ?? []) w(decision);
    this.waiters.delete(id);
    return this.get(id);
  }

  expire(id: string): void {
    this.store.transaction((tx) => {
      tx.db
        .prepare(
          "UPDATE approvals SET state = 'expired', decided_at = ? WHERE id = ? AND state = 'pending'",
        )
        .run(new Date().toISOString(), id);
    });
    this.waiters.delete(id);
  }

  get(id: string): Approval | null {
    const r = this.store.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
      | Row
      | undefined;
    return r ? toApproval(r) : null;
  }

  list(state?: string): Approval[] {
    const rows = (state
      ? this.store.db
          .prepare("SELECT * FROM approvals WHERE state = ? ORDER BY created_at DESC LIMIT 200")
          .all(state)
      : this.store.db
          .prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200")
          .all()) as unknown as Row[];
    return rows.map(toApproval);
  }

  /** On restart nothing is waiting in memory any more: pending approvals expire. */
  expireAllPending(): void {
    this.store.db
      .prepare("UPDATE approvals SET state = 'expired', decided_at = ? WHERE state = 'pending'")
      .run(new Date().toISOString());
  }
}
