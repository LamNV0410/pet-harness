// Small shared UI primitives.
import type { ReactNode } from "react";

const STATE_TONE: Record<string, string> = {
  passed: "ok",
  approved: "ok",
  available: "ok",
  done: "ok",
  completed: "ok",
  failed: "bad",
  error: "bad",
  denied: "bad",
  timed_out: "bad",
  blocked: "bad",
  unavailable: "bad",
  waiting_approval: "warn",
  pending: "warn",
  waiting: "warn",
  running: "info",
  preparing: "info",
  queued: "muted",
  cancelled: "muted",
  cached: "muted",
  expired: "muted",
};

export function StatePill({ state }: { state: string }) {
  return <span className={`pill ${STATE_TONE[state] ?? "muted"}`}>{state.replace(/_/g, " ")}</span>;
}

export function Panel({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        {actions && <div className="row-gap">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

export function duration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export const go = (hash: string) => {
  location.hash = hash;
};
