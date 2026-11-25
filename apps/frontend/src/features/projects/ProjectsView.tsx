// Projects list + latest verification per project (M1 + M2).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, contracts } from "../../api/client";
import { ago, go, Panel, StatePill } from "../../components/ui";

export function ProjectsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["projects"], queryFn: () => call(contracts.listProjects) });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => call(contracts.listRuns, { query: { limit: 100 } }),
  });
  const reload = useMutation({
    mutationFn: () => call(contracts.reloadProjects),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const latest = (projectId: string, commandId: string) =>
    runs.data?.runs.find(
      (r) =>
        r.projectId === projectId &&
        r.commandId === commandId &&
        ["passed", "failed", "cached"].includes(r.state),
    );

  return (
    <Panel
      title="Managed projects"
      actions={
        <>
          <span className="sub">from adapters/*.yaml</span>
          <button type="button" onClick={() => reload.mutate()} disabled={reload.isPending}>
            {reload.isPending ? "Reloading…" : "Reload adapters"}
          </button>
        </>
      }
    >
      {q.isPending && <p className="pad sub">Loading projects…</p>}
      {q.isError && (
        <p className="pad error">Could not load projects: {(q.error as Error).message}</p>
      )}
      {reload.data && reload.data.rejected.length > 0 && (
        <div className="pad error">
          Rejected adapters:{" "}
          {reload.data.rejected.map((r) => `${r.file}: ${r.errors.join("; ")}`).join(" · ")}
        </div>
      )}
      {q.data && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Base ref</th>
                <th>Status</th>
                <th>Last build</th>
                <th>Last test</th>
                <th>Secret paths (never readable)</th>
              </tr>
            </thead>
            <tbody>
              {q.data.projects.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => go(`project/${p.id}`)}>
                  <td>
                    <a href={`#project/${p.id}`}>
                      <b>{p.name}</b>
                    </a>
                    <div className="sub mono">{p.path}</div>
                  </td>
                  <td className="mono">{p.baseRef}</td>
                  <td>
                    <StatePill state={p.status} />
                    {p.reason && <div className="sub">{p.reason}</div>}
                  </td>
                  {(["build", "test"] as const).map((c) => {
                    const r = latest(p.id, c);
                    return (
                      <td key={c}>
                        {r ? (
                          <>
                            <StatePill state={r.state} />
                            <div className="sub mono">
                              {r.sha?.slice(0, 7)} · {ago(r.finishedAt)}
                            </div>
                          </>
                        ) : (
                          <span className="sub">not run</span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <div className="globs">
                      {p.secretPaths.map((s) => (
                        <code key={s}>{s}</code>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
