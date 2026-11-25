// Approval Center: every pending action waits here; one decision covers exactly one action.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call, contracts } from "../../api/client";
import { ago, Panel, StatePill } from "../../components/ui";

export function ApprovalsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["approvals"], queryFn: () => call(contracts.listApprovals) });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "denied" }) =>
      call(contracts.decideApproval, { params: { id: v.id }, body: { decision: v.decision } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
  const all = q.data?.approvals ?? [];
  const pending = all.filter((a) => a.state === "pending");
  const done = all.filter((a) => a.state !== "pending").slice(0, 30);

  return (
    <div className="stack">
      <Panel title={`Waiting for you (${pending.length})`}>
        {pending.length === 0 && <p className="pad sub">Nothing is waiting for your approval.</p>}
        <div className="cards">
          {pending.map((a) => (
            <div key={a.id} className="card">
              <div className="row-between">
                <b>{a.title}</b>
                <span className="pill warn">{a.kind}</span>
              </div>
              <div className="sub">
                Requested by {a.requestedBy} · {ago(a.createdAt)} ·{" "}
                {a.subjectId.startsWith("run:") ? (
                  <a href={`#run/${a.subjectId.slice(4)}`}>open run</a>
                ) : (
                  a.subjectId
                )}
              </div>
              <pre className="detail">{a.detail}</pre>
              {a.effects.length > 0 && (
                <ul className="effects">
                  {a.effects.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="row-gap">
                <button
                  type="button"
                  className="primary"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, decision: "approved" })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: a.id, decision: "denied" })}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Decided">
        {done.length === 0 ? (
          <p className="pad sub">No decisions yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <tbody>
                {done.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>
                      <StatePill state={a.state} />
                    </td>
                    <td className="sub">{ago(a.decidedAt)}</td>
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
