// Kanban: work items by stage. Gate columns show what waits on the PO.
import { STAGES, workflowContracts as wc } from "@harness/shared";
import { useQuery } from "@tanstack/react-query";
import { call } from "../../api/client";
import { ago, go, Panel, StatePill } from "../../components/ui";

const LABEL: Record<string, string> = {
  inbox: "Inbox",
  analysis: "Analysis · BA",
  gate1: "Gate 1",
  design: "Design · Architect",
  gate2: "Gate 2",
  build: "Build · BE/FE",
  verify: "Verify · Tester",
  gate4: "Gate 4",
  done: "Done",
  cancelled: "Cancelled",
};

export function KanbanView() {
  const items = useQuery({ queryKey: ["workitems"], queryFn: () => call(wc.listWorkItems) });
  const all = items.data?.workItems ?? [];
  return (
    <Panel title="Kanban" actions={<a href="#inbox">+ New requirement</a>}>
      <div className="scroll">
        <div className="board">
          {STAGES.filter((s) => s !== "cancelled").map((s) => {
            const col = all.filter((w) => w.stage === s);
            return (
              <div key={s} className={`col ${s.startsWith("gate") ? "gate" : ""}`}>
                <h3>
                  {LABEL[s]} <span className="count">{col.length}</span>
                </h3>
                {col.map((w) => (
                  <button type="button" key={w.id} className="wi" onClick={() => go(`wi/${w.id}`)}>
                    <span className="t">{w.title}</span>
                    <span className="sub mono">
                      {w.id} · {w.projectId}
                    </span>
                    <span className="row-gap">
                      <StatePill state={w.status} />
                      <span className="sub">{ago(w.updatedAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
