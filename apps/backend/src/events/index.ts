// SSE delivery of committed events (design.md §5.2, TD-04). Replays from the database first,
// then streams live; ids are database ids so a resume never duplicates (OQ-6).
import type { ServerResponse } from "node:http";
import type { HarnessEvent } from "@harness/shared";
import type { Store } from "../store/index.js";

const HEARTBEAT_MS = 15_000;
const REPLAY_BATCH = 500;

export function formatSse(e: HarnessEvent): string {
  return `id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

/** Parses Last-Event-ID / since. Returns null when the value is not a non-negative integer. */
export function parseResume(
  lastEventId: string | undefined,
  since: string | undefined,
): number | null {
  const raw = lastEventId ?? since;
  if (raw === undefined || raw === "") return 0;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function openStream(store: Store, res: ServerResponse, since: number): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  // Replay synchronously (node:sqlite is synchronous), so no live event can interleave.
  let cursor = since;
  for (;;) {
    const batch = store.listEvents(cursor, REPLAY_BATCH);
    for (const e of batch) res.write(formatSse(e));
    if (batch.length < REPLAY_BATCH) break;
    cursor = batch[batch.length - 1]?.id ?? cursor;
  }
  const unsubscribe = store.subscribe((e) => {
    if (e.id > since) res.write(formatSse(e));
  });
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
