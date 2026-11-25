// Typed API client built on the shared contracts. The session token comes from the <meta> tag
// injected by the backend (or the Vite dev plugin).
import {
  type ContractDef,
  contracts,
  ErrorBody,
  EVENT_TYPES,
  type HarnessEvent,
  HarnessEvent as HarnessEventSchema,
  pathOf,
} from "@harness/shared";
import type { z } from "zod";

export function sessionToken(): string {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="harness-session-token"]')?.content ?? ""
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function call<C extends ContractDef>(
  contract: C,
  opts: {
    params?: Record<string, string>;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<z.infer<C["response"]>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const url = pathOf(contract, opts.params) + (qs.size ? `?${qs}` : "");
  const res = await fetch(url, {
    method: contract.method,
    headers: { Authorization: `Bearer ${sessionToken()}`, "Content-Type": "application/json" },
    ...(contract.method === "POST" ? { body: JSON.stringify(opts.body ?? {}) } : {}),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ErrorBody.safeParse(json);
    throw err.success
      ? new ApiError(res.status, err.data.error.code, err.data.error.message)
      : new ApiError(res.status, "INTERNAL", `HTTP ${res.status}`);
  }
  return contract.response.parse(json) as z.infer<C["response"]>;
}

export { contracts };

/** Opens the event SSE stream. The browser reconnects by itself and resends Last-Event-ID. */
export function openEventStream(
  onEvent: (e: HarnessEvent) => void,
  onStatus: (s: "open" | "reconnecting") => void,
): () => void {
  const es = new EventSource(
    `${contracts.eventStream.path}?token=${encodeURIComponent(sessionToken())}`,
  );
  const handler = (msg: MessageEvent<string>) => {
    const parsed = HarnessEventSchema.safeParse(JSON.parse(msg.data));
    if (parsed.success) onEvent(parsed.data);
  };
  for (const type of EVENT_TYPES) es.addEventListener(type, handler as EventListener);
  es.onopen = () => onStatus("open");
  es.onerror = () => onStatus("reconnecting");
  return () => es.close();
}

/** Live log lines of one run (event: line / end). */
export function openRunLog(
  runId: string,
  onLine: (l: string) => void,
  onEnd: () => void,
): () => void {
  const es = new EventSource(
    `${pathOf(contracts.runLogStream, { id: runId })}?token=${encodeURIComponent(sessionToken())}`,
  );
  es.addEventListener("line", ((m: MessageEvent<string>) =>
    onLine(JSON.parse(m.data) as string)) as EventListener);
  es.addEventListener("end", () => {
    es.close();
    onEnd();
  });
  return () => es.close();
}
