// One agent run: live activity (tool calls, denials, messages) and the final report.

import { workflowContracts as wc } from "@harness/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "../../api/client";
import { Markdown } from "../../components/Markdown";
import { Panel, StatePill } from "../../components/ui";

export function AgentRunDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["agent", id],
    queryFn: () => call(wc.getAgentRun, { params: { id } }),
    refetchInterval: (s) =>
      s.state.data && ["running", "queued"].includes(s.state.data.agentRun.state) ? 2000 : false,
  });
  const cancel = useMutation({
    mutationFn: () => call(wc.cancelAgentRun, { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent", id] }),
  });
  if (!q.data) return <p className="sub">Loading…</p>;
  const { agentRun: r, activity, output } = q.data;
  return (
    <div className="stack">
      <p className="crumbs">
        <a href={`#wi/${r.workItemId}`}>{r.workItemId}</a> / {r.role.toUpperCase()} agent
      </p>
      <Panel
        title={`${r.role.toUpperCase()} · ${r.purpose}`}
        actions={
          <>
            <StatePill state={r.state} />
            {r.state === "running" && (
              <button type="button" className="danger" onClick={() => cancel.mutate()}>
                Stop
              </button>
            )}
          </>
        }
      >
        <dl className="facts">
          <dt>Turns</dt>
          <dd>{r.turns ?? "—"}</dd>
          <dt>Tokens</dt>
          <dd className="mono">
            in {r.inputTokens ?? "—"} · out {r.outputTokens ?? "—"}
          </dd>
          <dt>Est. cost</dt>
          <dd className="mono">
            {r.costUsd !== null
              ? `$${r.costUsd.toFixed(4)} (estimate; billed to your subscription quota)`
              : "—"}
          </dd>
          {r.error && (
            <>
              <dt>Error</dt>
              <dd className="error">{r.error}</dd>
            </>
          )}
        </dl>
      </Panel>
      <Panel title={`Activity (${activity.length})`}>
        <ul className="feed">
          {activity.map((a, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, never reordered
              key={`${a.ts}-${i}`}
              className={
                a.kind === "denied" || a.kind === "error"
                  ? "deny"
                  : a.kind === "result"
                    ? "allow"
                    : ""
              }
            >
              <span className="time">{new Date(a.ts).toLocaleTimeString()}</span>
              <span className="actor">{a.kind}</span>
              <span className="body detail">{a.text}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {output && (
        <Panel title="Final report">
          <Markdown text={output} />
        </Panel>
      )}
    </div>
  );
}
