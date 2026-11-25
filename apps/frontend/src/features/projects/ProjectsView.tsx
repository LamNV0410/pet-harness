// Projects view (AC-7.1): managed repos, base ref, availability, secret paths (never readable).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

export function ProjectsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const reload = useMutation({
    mutationFn: api.reloadProjects,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <section className="panel">
      <div className="panel-h">
        <h2>Managed projects</h2>
        <div className="row-gap">
          <span className="sub">from adapters/*.yaml · read-only</span>
          <button type="button" onClick={() => reload.mutate()} disabled={reload.isPending}>
            {reload.isPending ? "Reloading…" : "Reload adapters"}
          </button>
        </div>
      </div>
      {q.isPending && <p className="pad sub">Loading projects…</p>}
      {q.isError && (
        <p className="pad error">Could not load projects: {(q.error as Error).message}</p>
      )}
      {reload.data && reload.data.rejected.length > 0 && (
        <div className="pad error">
          Rejected adapters:
          <ul>
            {reload.data.rejected.map((r) => (
              <li key={r.file}>
                <code>{r.file}</code>: {r.errors.join("; ")}
              </li>
            ))}
          </ul>
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
                <th>Secret paths (never readable)</th>
              </tr>
            </thead>
            <tbody>
              {q.data.projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <div className="sub mono">{p.path}</div>
                  </td>
                  <td className="mono">{p.baseRef}</td>
                  <td>
                    <span className={`pill ${p.status === "available" ? "ok" : "bad"}`}>
                      {p.status}
                    </span>
                    {p.reason && <div className="sub">{p.reason}</div>}
                  </td>
                  <td>
                    <div className="globs">
                      {p.secretPaths.map((s) => (
                        <code key={s}>{s}</code>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {q.data.projects.length === 0 && (
                <tr>
                  <td colSpan={4} className="sub">
                    No projects registered. Add an adapter file under adapters/.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
