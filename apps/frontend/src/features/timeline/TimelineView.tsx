// Timeline view (AC-7.2, AC-7.3): live events, newest first, with a one-line summary per type.
import type { HarnessEvent } from "@harness/shared";

function summary(e: HarnessEvent): string {
  switch (e.type) {
    case "system.started":
      return `Harness ${e.payload.version} started`;
    case "project.registered":
      return `${e.payload.projectId} · base ${e.payload.baseRef} · ${e.payload.status}`;
    case "project.status_changed":
      return `${e.payload.projectId} → ${e.payload.status}${e.payload.reason ? ` (${e.payload.reason})` : ""}`;
    case "adapter.rejected":
      return `${e.payload.file}: ${e.payload.errors.join("; ")}`;
    case "tool.requested":
      return `${e.payload.role} → ${e.payload.tool} on ${e.payload.projectId}`;
    case "tool.decided":
      return `${e.payload.decision.toUpperCase()} ${e.payload.tool} · ${e.payload.ruleId} · ${e.payload.reason}`;
    case "tool.started":
      return e.payload.tool;
    case "tool.finished":
      return `${e.payload.tool} ${e.payload.ok ? "ok" : `failed: ${e.payload.error ?? ""}`} · ${e.payload.durationMs} ms · ${e.payload.outputBytes} B${e.payload.filtered ? " · secrets withheld" : ""}`;
    case "run.state_changed":
      return `${e.payload.projectId} ${e.payload.commandId} → ${e.payload.state.replace(/_/g, " ")}${e.payload.sha ? ` @ ${e.payload.sha.slice(0, 7)}` : ""}${e.payload.summary ? ` · ${e.payload.summary}` : ""}`;
    case "approval.requested":
      return `waiting for PO: ${e.payload.title}`;
    case "approval.decided":
      return `${e.payload.decision.toUpperCase()} · ${e.payload.title}`;
    case "agent.activity":
      return `${e.payload.role}${e.payload.workItemId ? ` · ${e.payload.workItemId}` : ""} · ${e.payload.state} · ${e.payload.text}`;
    case "workitem.changed":
      return `${e.payload.workItemId} "${e.payload.title}" → ${e.payload.stage} (${e.payload.status})`;
  }
}

function tone(e: HarnessEvent): string {
  if (e.type === "tool.decided") return e.payload.decision === "deny" ? "deny" : "allow";
  if (e.type === "adapter.rejected") return "deny";
  if (e.type === "tool.finished" && !e.payload.ok) return "deny";
  if (e.type === "run.state_changed") {
    if (["failed", "error", "timed_out", "denied"].includes(e.payload.state)) return "deny";
    if (e.payload.state === "passed") return "allow";
  }
  if (e.type === "approval.requested") return "ask";
  if (e.type === "approval.decided") return e.payload.decision === "approved" ? "allow" : "deny";
  return "";
}

export function TimelineView({ events }: { events: HarnessEvent[] }) {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Activity timeline</h2>
        <span className="sub">{events.length} events · newest first · live</span>
      </div>
      {events.length === 0 ? (
        <p className="pad sub">
          No events yet. They appear here as soon as the Harness records them.
        </p>
      ) : (
        <ul className="feed">
          {events.map((e) => (
            <li key={e.id} className={tone(e)}>
              <span className="id">#{e.id}</span>
              <span className="time">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="actor">{e.actor}</span>
              <span className="body">
                <span className="type">{e.type}</span> <span className="detail">{summary(e)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
