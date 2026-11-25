// Virtual Office (06): a pure projection of real events. No AI calls, no invented text.
import type { HarnessEvent } from "@harness/shared";
import { useMemo, useState } from "react";

type DeskState =
  | "idle"
  | "working"
  | "reading"
  | "editing"
  | "building"
  | "waiting"
  | "blocked"
  | "done";

interface Desk {
  id: string;
  name: string;
  ini: string;
  state: DeskState;
  say: string;
  link: string | null;
  at: string | null;
}

const ROLES: { id: string; name: string; ini: string }[] = [
  { id: "po", name: "PO (you)", ini: "PO" },
  { id: "orchestrator", name: "Orchestrator", ini: "OR" },
  { id: "ba", name: "BA", ini: "BA" },
  { id: "architect", name: "Architect", ini: "AR" },
  { id: "be", name: "BE Agent", ini: "BE" },
  { id: "fe", name: "FE Agent", ini: "FE" },
  { id: "tester", name: "Tester", ini: "TE" },
  { id: "release", name: "Release Mgr", ini: "RM" },
];

/** Replays events (oldest first) into one state per desk. */
export function project(eventsNewestFirst: HarnessEvent[]): Desk[] {
  const desks = new Map<string, Desk>(
    ROLES.map((r) => [r.id, { ...r, state: "idle" as DeskState, say: "—", link: null, at: null }]),
  );
  const pending = new Map<string, string>();
  const set = (id: string, state: DeskState, say: string, link: string | null, at: string) => {
    const d = desks.get(id);
    if (d) Object.assign(d, { state, say, link, at });
  };
  for (const e of [...eventsNewestFirst].reverse()) {
    switch (e.type) {
      case "agent.activity": {
        const p = e.payload;
        const link = `#agent/${p.agentRunId}`;
        const st: DeskState =
          p.state === "tool"
            ? /^(Edit|Write|MultiEdit)/.test(p.text)
              ? "editing"
              : "reading"
            : p.state === "result"
              ? "done"
              : p.state === "error"
                ? "blocked"
                : "working";
        set(p.role, st, p.text, link, e.ts);
        break;
      }
      case "workitem.changed":
        set(
          "orchestrator",
          e.payload.status === "done" ? "done" : "working",
          `${e.payload.workItemId} → ${e.payload.stage}`,
          `#wi/${e.payload.workItemId}`,
          e.ts,
        );
        break;
      case "run.state_changed": {
        const p = e.payload;
        if (p.runId.startsWith("server:")) break;
        const who = e.actor === "tester" ? "tester" : "tester";
        const st: DeskState = ["queued", "preparing", "running"].includes(p.state)
          ? "building"
          : p.state === "passed" || p.state === "cached"
            ? "done"
            : p.state === "waiting_approval"
              ? "waiting"
              : "blocked";
        set(
          who,
          st,
          `${p.projectId} ${p.commandId}: ${p.state}${p.summary ? ` · ${p.summary}` : ""}`,
          `#run/${p.runId}`,
          e.ts,
        );
        break;
      }
      case "approval.requested":
        pending.set(e.payload.approvalId, e.payload.title);
        break;
      case "approval.decided":
        pending.delete(e.payload.approvalId);
        break;
      default:
        break;
    }
  }
  const po = desks.get("po");
  if (po) {
    const titles = [...pending.values()];
    Object.assign(
      po,
      titles.length
        ? {
            state: "waiting",
            say: `${titles.length} waiting: ${titles[titles.length - 1]}`,
            link: "#approvals",
          }
        : { state: "idle", say: "Nothing waiting", link: "#approvals" },
    );
  }
  return [...desks.values()];
}

const PROP: Partial<Record<DeskState, string>> = {
  reading: "R",
  editing: "E",
  building: "⚙",
  waiting: "✋",
  blocked: "!",
  done: "✓",
};

export function OfficeView({ events }: { events: HarnessEvent[] }) {
  const desks = useMemo(() => project(events), [events]);
  const [list, setList] = useState(false);
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Virtual Office</h2>
        <div className="row-gap">
          <span className="sub">driven by real events · no AI calls</span>
          <button type="button" onClick={() => setList((v) => !v)}>
            {list ? "Office view" : "List view"}
          </button>
        </div>
      </div>
      {list ? (
        <table>
          <tbody>
            {desks.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="mono">{d.state}</td>
                <td className="summary">{d.say}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="office">
          {desks.map((d) => (
            <a
              key={d.id}
              className={`desk ${d.id === "po" ? "po" : ""}`}
              data-state={d.state}
              href={d.link ?? undefined}
            >
              <div className="avatar">
                {d.ini}
                {PROP[d.state] && <span className="prop">{PROP[d.state]}</span>}
              </div>
              <div className="role">{d.name}</div>
              <div className="state mono">{d.state}</div>
              <div className="bubble">{d.say}</div>
            </a>
          ))}
        </div>
      )}
      <div className="legend">
        <span className="l-idle">idle</span>
        <span className="l-work">working</span>
        <span className="l-wait">waiting for PO</span>
        <span className="l-block">blocked</span>
        <span className="l-done">done</span>
      </div>
    </section>
  );
}
