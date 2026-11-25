// Typed API client built on the shared contracts (design.md §6, OQ-15). The session token comes
// from the <meta> tag injected by the backend (or the Vite dev plugin).
import {
  type ContractDef,
  contracts,
  ErrorBody,
  type HarnessEvent,
  HarnessEvent as HarnessEventSchema,
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

async function request<C extends ContractDef>(
  contract: C,
  init?: RequestInit,
): Promise<z.infer<C["response"]>> {
  const res = await fetch(contract.path, {
    ...init,
    method: contract.method,
    headers: { Authorization: `Bearer ${sessionToken()}`, "Content-Type": "application/json" },
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

export const api = {
  health: () => request(contracts.health),
  projects: () => request(contracts.listProjects),
  reloadProjects: () => request(contracts.reloadProjects, { body: "{}" }),
};

/** Opens the SSE stream. The browser reconnects by itself and resends Last-Event-ID (AC-7.3). */
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
  for (const type of [
    "system.started",
    "project.registered",
    "project.status_changed",
    "adapter.rejected",
    "tool.requested",
    "tool.decided",
    "tool.started",
    "tool.finished",
  ]) {
    es.addEventListener(type, handler as EventListener);
  }
  es.onopen = () => onStatus("open");
  es.onerror = () => onStatus("reconnecting");
  return () => es.close();
}
