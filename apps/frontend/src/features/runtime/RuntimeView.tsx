// Product servers (M6): start always needs an approval; health is probed; auto-stop after max runtime.
import { workflowContracts as wc } from "@harness/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "../../api/client";
import { ago, Panel, StatePill } from "../../components/ui";

export function RuntimeView() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["servers"],
    queryFn: () => call(wc.listServers),
    refetchInterval: 4000,
  });
  const start = useMutation({
    mutationFn: (id: string) => call(wc.startServer, { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
  const stop = useMutation({
    mutationFn: (id: string) => call(wc.stopServer, { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servers"] }),
  });
  return (
    <Panel title="Product servers">
      <div className="cards">
        {q.data?.servers.map((s) => (
          <div key={s.projectId} className="card">
            <div className="row-between">
              <b>{s.projectId}</b>
              <StatePill
                state={
                  s.state === "healthy"
                    ? "passed"
                    : s.state === "waiting_approval"
                      ? "waiting_approval"
                      : s.state === "failed" || s.state === "unhealthy"
                        ? "failed"
                        : s.state === "stopped"
                          ? "cancelled"
                          : "running"
                }
              />
            </div>
            <dl className="facts">
              <dt>State</dt>
              <dd>{s.state.replace(/_/g, " ")}</dd>
              <dt>URL</dt>
              <dd className="mono">
                {s.url && s.state !== "stopped" ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.url}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Commit</dt>
              <dd className="mono">{s.sha?.slice(0, 10) ?? "—"}</dd>
              <dt>Health</dt>
              <dd>{s.lastHealth ?? "—"}</dd>
              <dt>Auto-stop</dt>
              <dd>{s.stopsAt ? new Date(s.stopsAt).toLocaleTimeString() : "—"}</dd>
              <dt>Started</dt>
              <dd>{ago(s.startedAt)}</dd>
            </dl>
            <div className="row-gap">
              {(s.state === "stopped" || s.state === "failed") && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => start.mutate(s.projectId)}
                  disabled={start.isPending}
                >
                  Request start
                </button>
              )}
              {s.state === "waiting_approval" && (
                <a href="#approvals">Approve in the Approval Center →</a>
              )}
              {!["stopped", "failed"].includes(s.state) && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => stop.mutate(s.projectId)}
                  disabled={stop.isPending}
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {start.isError && <p className="pad error">{(start.error as Error).message}</p>}
      <p className="pad sub">
        furwatch-api runs with the Development profile against the dev/test database (TD-13). Every
        start needs your approval and the server stops on its own after the time limit.
      </p>
    </Panel>
  );
}
