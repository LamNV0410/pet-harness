// One project: declared commands with Run buttons, run history (M2).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { call, contracts } from "../../api/client";
import { ago, duration, go, Panel, StatePill } from "../../components/ui";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [fetchLatest, setFetchLatest] = useState(true);
  const [keep, setKeep] = useState(false);
  const cmds = useQuery({
    queryKey: ["commands", projectId],
    queryFn: () => call(contracts.listCommands, { params: { id: projectId } }),
  });
  const runs = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () => call(contracts.listRuns, { query: { projectId, limit: 30 } }),
  });
  const start = useMutation({
    mutationFn: (v: { commandId: string; rerun: boolean }) =>
      call(contracts.startRun, {
        params: { id: projectId },
        body: { ...v, fetch: fetchLatest, keepWorktree: keep },
      }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["runs"] });
      go(`run/${d.run.id}`);
    },
  });

  return (
    <div className="stack">
      <p className="crumbs">
        <a href="#projects">Projects</a> / <b>{projectId}</b>
      </p>
      <Panel
        title="Verify"
        actions={
          <>
            <label className="check">
              <input
                id="fetch-latest"
                type="checkbox"
                checked={fetchLatest}
                onChange={(e) => setFetchLatest(e.target.checked)}
              />{" "}
              Fetch latest
            </label>
            <label className="check">
              <input
                id="keep-worktree"
                type="checkbox"
                checked={keep}
                onChange={(e) => setKeep(e.target.checked)}
              />{" "}
              Keep worktree
            </label>
          </>
        }
      >
        {cmds.isError && <p className="pad error">{(cmds.error as Error).message}</p>}
        <div className="cmd-grid">
          {cmds.data?.commands
            .filter((c) => c.kind === "verify")
            .map((c) => (
              <div key={c.id} className="cmd">
                <div className="row-gap">
                  <b>{c.id}</b>
                  {c.approval === "ask" && <span className="pill warn">needs approval</span>}
                </div>
                <code className="argv">{c.argv.join(" ")}</code>
                <div className="row-gap">
                  <button
                    type="button"
                    className="primary"
                    disabled={start.isPending}
                    onClick={() => start.mutate({ commandId: c.id, rerun: false })}
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    disabled={start.isPending}
                    onClick={() => start.mutate({ commandId: c.id, rerun: true })}
                    title="Ignore the stored verdict for this commit"
                  >
                    Run again
                  </button>
                </div>
              </div>
            ))}
        </div>
        {start.isError && <p className="pad error">{(start.error as Error).message}</p>}
        <p className="pad sub">
          Each run uses a fresh git worktree at the base ref, so your own checkout is never touched.
          Results are stored per commit: running the same command on the same commit reuses the
          stored verdict unless you choose "Run again".
        </p>
      </Panel>
      <Panel title="Run history">
        <RunTable runs={runs.data?.runs ?? []} />
      </Panel>
    </div>
  );
}

export function RunTable({
  runs,
  showProject = false,
}: {
  runs: import("@harness/shared").CommandRun[];
  showProject?: boolean;
}) {
  if (!runs.length) return <p className="pad sub">No runs yet.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {showProject && <th>Project</th>}
            <th>Command</th>
            <th>State</th>
            <th>Commit</th>
            <th>Summary</th>
            <th>Duration</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => go(`run/${r.id}`)}>
              {showProject && <td className="mono">{r.projectId}</td>}
              <td className="mono">
                <a href={`#run/${r.id}`}>{r.commandId}</a>
              </td>
              <td>
                <StatePill state={r.state} />
              </td>
              <td className="mono">{r.sha?.slice(0, 7) ?? "—"}</td>
              <td className="summary">{r.summary ?? ""}</td>
              <td className="mono">{duration(r.durationMs)}</td>
              <td className="sub">{ago(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
