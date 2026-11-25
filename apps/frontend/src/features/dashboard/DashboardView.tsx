// Agent dashboard: what is running, what waits on the PO, usage.
import { workflowContracts as wc } from "@harness/shared";
import { useQuery } from "@tanstack/react-query";
import { call } from "../../api/client";
import { ago, Panel, StatePill } from "../../components/ui";

export function DashboardView() {
  const d = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => call(wc.dashboard),
    refetchInterval: 10_000,
  });
  const runs = useQuery({
    queryKey: ["agent-runs"],
    queryFn: () => call(wc.listAgentRuns),
    refetchInterval: 10_000,
  });
  const x = d.data;
  return (
    <div className="stack">
      {x && !x.agents.cli && (
        <div className="banner error">
          Claude Code CLI not found. Agents cannot run until it is installed and logged in.
        </div>
      )}
      <div className="tiles">
        <a className="tile" href="#approvals">
          <span className="sub">Waiting for you</span>
          <b className={x?.pendingApprovals ? "warn" : ""}>{x?.pendingApprovals ?? "—"}</b>
          <span className="sub">approvals</span>
        </a>
        <div className="tile">
          <span className="sub">Agents</span>
          <b>{x?.agents.running ?? "—"}</b>
          <span className="sub">running · {x?.agents.queued ?? 0} queued</span>
        </div>
        <div className="tile">
          <span className="sub">Builds/tests (24h)</span>
          <b>{x ? `${x.runs.passed24h} ✓ · ${x.runs.failed24h} ✗` : "—"}</b>
          <span className="sub">{x?.runs.running ?? 0} running</span>
        </div>
        <div className="tile">
          <span className="sub">Agent usage</span>
          <b>{x ? `${Math.round((x.usage.inputTokens + x.usage.outputTokens) / 1000)}k` : "—"}</b>
          <span className="sub">
            tokens · {x?.usage.agentRuns ?? 0} runs · est. ${x?.usage.costUsd.toFixed(2) ?? "0.00"}
          </span>
        </div>
      </div>
      <Panel title="Work items by stage" actions={<a href="#kanban">Open Kanban</a>}>
        <div className="chips pad">
          {x && Object.keys(x.workItems).length === 0 && (
            <span className="sub">No work items yet — start in the Inbox.</span>
          )}
          {x &&
            Object.entries(x.workItems).map(([stage, n]) => (
              <span key={stage} className="chip">
                {stage}: {n}
              </span>
            ))}
        </div>
      </Panel>
      <Panel title="Recent agent runs">
        {!runs.data?.agentRuns.length ? (
          <p className="pad sub">No agent runs yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <tbody>
                {runs.data.agentRuns.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">
                      <a href={`#agent/${r.id}`}>{r.role.toUpperCase()}</a>
                    </td>
                    <td className="mono">
                      <a href={`#wi/${r.workItemId}`}>{r.workItemId}</a>
                    </td>
                    <td>{r.purpose}</td>
                    <td>
                      <StatePill state={r.state} />
                    </td>
                    <td className="sub">{ago(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
