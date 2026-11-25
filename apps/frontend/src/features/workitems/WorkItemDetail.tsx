// One work item: stage track, gate decision, artifacts, tasks, agent runs, verification, diff.

import { STAGES, workflowContracts as wc } from "@harness/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { call, contracts } from "../../api/client";
import { Markdown } from "../../components/Markdown";
import { ago, Panel, StatePill } from "../../components/ui";
import { RunTable } from "../projects/ProjectDetail";

export function WorkItemDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wi", id],
    queryFn: () => call(wc.getWorkItem, { params: { id } }),
  });
  const [note, setNote] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const diff = useQuery({
    queryKey: ["wi-diff", id],
    queryFn: () => call(wc.workItemDiff, { params: { id } }),
    enabled: showDiff,
  });
  const act = useMutation({
    mutationFn: (action: "retry" | "cancel") =>
      call(wc.workItemAction, { params: { id }, body: note ? { action, note } : { action } }),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["wi", id] });
    },
  });
  const decide = useMutation({
    mutationFn: (v: { approvalId: string; decision: "approved" | "denied" }) =>
      call(contracts.decideApproval, {
        params: { id: v.approvalId },
        body: { decision: v.decision },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wi", id] }),
  });
  if (q.isError) return <p className="error">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="sub">Loading…</p>;
  const { workItem: w, artifacts, tasks, agentRuns, runs, pendingApprovalId } = q.data;
  const stageIdx = STAGES.indexOf(w.stage);
  const closed = w.stage === "done" || w.stage === "cancelled";

  return (
    <div className="stack">
      <p className="crumbs">
        <a href="#kanban">Kanban</a> / <b>{w.id}</b>
      </p>
      <Panel title={`${w.id} · ${w.title}`} actions={<StatePill state={w.status} />}>
        <ol className="track">
          {STAGES.filter((s) => s !== "cancelled").map((s, i) => (
            <li
              key={s}
              className={i < stageIdx || w.stage === "done" ? "past" : s === w.stage ? "now" : ""}
            >
              {s}
            </li>
          ))}
        </ol>
        <dl className="facts">
          <dt>Project</dt>
          <dd className="mono">{w.projectId}</dd>
          <dt>Requirement</dt>
          <dd className="pre">{w.description}</dd>
          {w.note && (
            <>
              <dt>Note</dt>
              <dd className={w.status === "blocked" ? "error" : ""}>{w.note}</dd>
            </>
          )}
        </dl>
        {pendingApprovalId && (
          <div className="gatebox">
            <b>Waiting for your decision ({w.stage})</b>
            <div className="row-gap">
              <button
                type="button"
                className="primary"
                onClick={() =>
                  decide.mutate({ approvalId: pendingApprovalId, decision: "approved" })
                }
                disabled={decide.isPending}
              >
                Approve
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => decide.mutate({ approvalId: pendingApprovalId, decision: "denied" })}
                disabled={decide.isPending}
              >
                Request changes
              </button>
            </div>
          </div>
        )}
        {!closed && (
          <div className="pad form">
            <label htmlFor="wi-note">Note for the agents (used on Retry)</label>
            <textarea
              id="wi-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Keep the existing endpoint; only add a new field."
            />
            <div className="row-gap">
              <button type="button" onClick={() => act.mutate("retry")} disabled={act.isPending}>
                Retry current stage
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => act.mutate("cancel")}
                disabled={act.isPending}
              >
                Cancel work item
              </button>
            </div>
          </div>
        )}
      </Panel>

      {artifacts.map((a, i) => (
        <Panel
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only artifacts
          key={`${a.kind}-${i}`}
          title={a.title}
          actions={
            <span className="sub">
              {ago(a.createdAt)}
              {a.agentRunId ? " · " : ""}
              {a.agentRunId && <a href={`#agent/${a.agentRunId}`}>agent run</a>}
            </span>
          }
        >
          <Markdown text={a.content} />
        </Panel>
      ))}

      {tasks.length > 0 && (
        <Panel
          title="Tasks"
          actions={
            <button type="button" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? "Hide changes" : "Show code changes"}
            </button>
          }
        >
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Branch</th>
                  <th>Commit</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <b className="mono">{t.id}</b> {t.title}
                    </td>
                    <td className="mono">{t.owner.toUpperCase()}</td>
                    <td className="mono">{t.projectId}</td>
                    <td>
                      <StatePill state={t.status} />
                    </td>
                    <td className="mono">{t.branch ?? "—"}</td>
                    <td className="mono">{t.commit?.slice(0, 8) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showDiff &&
            (diff.data?.diffs.length ? (
              diff.data.diffs.map((d) => (
                <div key={d.taskId} className="pad">
                  <b className="mono">
                    {d.taskId} · {d.branch}
                  </b>{" "}
                  <span className="sub">
                    {d.files.length} files
                    {d.withheld.length ? ` · ${d.withheld.length} secret files withheld` : ""}
                  </span>
                  <pre className="log diff">
                    {d.patch.split("\n").map((l, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
                        key={`${d.taskId}-${i}`}
                        className={
                          l.startsWith("+") && !l.startsWith("+++")
                            ? "add"
                            : l.startsWith("-") && !l.startsWith("---")
                              ? "del"
                              : l.startsWith("@@")
                                ? "h"
                                : ""
                        }
                      >
                        {l}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                </div>
              ))
            ) : (
              <p className="pad sub">
                {diff.isPending ? "Loading changes…" : "No code changes yet."}
              </p>
            ))}
        </Panel>
      )}

      <Panel title="Agent runs">
        {agentRuns.length === 0 ? (
          <p className="pad sub">No agent runs yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <tbody>
                {agentRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">
                      <a href={`#agent/${r.id}`}>{r.role.toUpperCase()}</a>
                    </td>
                    <td>{r.purpose}</td>
                    <td>
                      <StatePill state={r.state} />
                    </td>
                    <td className="sub">{r.turns ?? "—"} turns</td>
                    <td className="sub summary">{r.error ?? ""}</td>
                    <td className="sub">{ago(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {runs.length > 0 && (
        <Panel title="Verification runs">
          <RunTable runs={runs} showProject />
        </Panel>
      )}
    </div>
  );
}
