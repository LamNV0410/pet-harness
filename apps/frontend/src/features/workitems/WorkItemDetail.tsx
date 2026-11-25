// One work item. A compact header (stage track + gate decision) and one page per role:
// Overview · Requirement (BA) · Design (Architect) · Build (BE/FE) · Verify (Tester).
// Each role page shows only that role's latest document as markdown; older versions fold away.
// Route: #wi/<id>/<tab>. Without a tab, the page for the current stage opens.

import type { Stage } from "@harness/shared";
import { STAGES, workflowContracts as wc } from "@harness/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { call, contracts } from "../../api/client";
import { Markdown } from "../../components/Markdown";
import { ago, Panel, StatePill } from "../../components/ui";
import { RunTable } from "../projects/ProjectDetail";

type Detail = Awaited<ReturnType<typeof call<typeof wc.getWorkItem>>>;
type Artifact = Detail["artifacts"][number];
type AgentRun = Detail["agentRuns"][number];
type Tab = "overview" | "brief" | "design" | "build" | "verify";

const TABS: { key: Tab; label: string; role: string }[] = [
  { key: "overview", label: "Overview", role: "PO" },
  { key: "brief", label: "Requirement", role: "BA" },
  { key: "design", label: "Design", role: "Architect" },
  { key: "build", label: "Build", role: "BE / FE" },
  { key: "verify", label: "Verify", role: "Tester" },
];

const TAB_OF_STAGE: Record<Stage, Tab> = {
  inbox: "overview",
  analysis: "brief",
  gate1: "brief",
  design: "design",
  gate2: "design",
  build: "build",
  verify: "verify",
  gate4: "verify",
  done: "overview",
  cancelled: "overview",
};

const GATE_TEXT: Partial<Record<Stage, string>> = {
  gate1: "Approve the requirement brief",
  gate2: "Approve the design and tasks",
  gate4: "Accept the change",
};

const asTab = (t: string | undefined): Tab | null =>
  TABS.some((x) => x.key === t) ? (t as Tab) : null;

export function WorkItemDetail({ id, tab }: { id: string; tab?: string | undefined }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wi", id],
    queryFn: () => call(wc.getWorkItem, { params: { id } }),
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
  const d = q.data;
  const { workItem: w, pendingApprovalId } = d;
  const stageIdx = STAGES.indexOf(w.stage);
  const current = asTab(tab) ?? TAB_OF_STAGE[w.stage];
  const gateTab = TAB_OF_STAGE[w.stage];

  return (
    <div className="stack">
      <p className="crumbs">
        <a href="#kanban">Kanban</a> / <b>{w.id}</b>
      </p>

      <section className="panel wi-head">
        <div className="wi-title">
          <h2>
            <span className="mono">{w.id}</span> {w.title}
          </h2>
          <StatePill state={w.status} />
        </div>
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
        {!pendingApprovalId && w.note && w.status === "blocked" && (
          <div className="gatebox blocked">
            <span>
              <b>Blocked</b> · {w.note}
            </span>
            {current !== "overview" && <a href={`#wi/${w.id}/overview`}>Add a note and retry</a>}
          </div>
        )}
        {pendingApprovalId && (
          <div className="gatebox">
            <span>
              <b>Waiting for you · {GATE_TEXT[w.stage] ?? w.stage}</b>
              {current !== gateTab && (
                <>
                  {" "}
                  — <a href={`#wi/${w.id}/${gateTab}`}>read it first</a>
                </>
              )}
            </span>
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
        <nav className="tabs" aria-label="Work item pages">
          {TABS.map((t) => {
            const n = countFor(t.key, d);
            return (
              <a
                key={t.key}
                href={`#wi/${w.id}/${t.key}`}
                aria-current={current === t.key ? "page" : undefined}
                className={n === 0 && t.key !== "overview" ? "empty" : ""}
              >
                <span>{t.label}</span>
                <small>{t.role}</small>
                {t.key === gateTab && pendingApprovalId && (
                  <i className="tab-dot" aria-hidden="true" />
                )}
              </a>
            );
          })}
        </nav>
      </section>

      {current === "overview" && <Overview d={d} />}
      {current === "brief" && (
        <RolePage
          d={d}
          kinds={(k) => k === "brief"}
          roles={["ba"]}
          empty="The BA has not written the brief yet."
        />
      )}
      {current === "design" && (
        <RolePage
          d={d}
          kinds={(k) => k === "design"}
          roles={["architect"]}
          empty="The Architect starts after you approve the requirement (gate 1)."
        >
          <TaskTable d={d} />
        </RolePage>
      )}
      {current === "build" && (
        <RolePage
          d={d}
          kinds={(k) => k.startsWith("report-")}
          roles={["be", "fe"]}
          perTask
          empty="BE/FE agents start after you approve the design (gate 2)."
        >
          <TaskTable d={d} />
          <DiffPanel id={w.id} hasTasks={d.tasks.length > 0} />
        </RolePage>
      )}
      {current === "verify" && (
        <RolePage
          d={d}
          kinds={(k) => k === "verification"}
          roles={["tester"]}
          empty="Verification runs after the build."
        >
          {d.runs.length > 0 && (
            <Panel title="Build and test runs">
              <RunTable runs={d.runs} showProject />
            </Panel>
          )}
        </RolePage>
      )}
    </div>
  );
}

function countFor(tab: Tab, d: Detail): number {
  const a = d.artifacts;
  if (tab === "brief") return a.filter((x) => x.kind === "brief").length;
  if (tab === "design") return a.filter((x) => x.kind === "design").length;
  if (tab === "build") return a.filter((x) => x.kind.startsWith("report-")).length + d.tasks.length;
  if (tab === "verify") return a.filter((x) => x.kind === "verification").length + d.runs.length;
  return 1;
}

/** Usage line for the agent runs of one role. */
function RunStrip({ runs }: { runs: AgentRun[] }) {
  if (!runs.length) return null;
  return (
    <div className="runstrip">
      {runs.map((r) => (
        <a key={r.id} href={`#agent/${r.id}`} className="runchip">
          <b className="mono">{r.role.toUpperCase()}</b>
          <StatePill state={r.state} />
          <span>{r.turns ?? "—"} turns</span>
          {r.costUsd != null && <span>${r.costUsd.toFixed(2)}</span>}
          {r.inputTokens != null && (
            <span>{Math.round((r.inputTokens + (r.outputTokens ?? 0)) / 1000)}k tokens</span>
          )}
          <span className="sub">{ago(r.createdAt)}</span>
        </a>
      ))}
    </div>
  );
}

function Doc({ a, label }: { a: Artifact; label?: string }) {
  return (
    <Panel
      title={label ?? a.title}
      actions={
        <span className="sub">
          {ago(a.createdAt)}
          {a.agentRunId && (
            <>
              {" · "}
              <a href={`#agent/${a.agentRunId}`}>agent run</a>
            </>
          )}
        </span>
      }
    >
      <Markdown text={a.content} />
    </Panel>
  );
}

function RolePage({
  d,
  kinds,
  roles,
  empty,
  perTask = false,
  children,
}: {
  d: Detail;
  kinds: (kind: string) => boolean;
  roles: string[];
  empty: string;
  perTask?: boolean;
  children?: ReactNode;
}) {
  const docs = d.artifacts.filter((a) => kinds(a.kind));
  const runs = d.agentRuns.filter((r) => roles.includes(r.role));
  // Latest document per kind (per task on the Build page); the rest are older versions.
  const latest = new Map<string, Artifact>();
  for (const a of docs) latest.set(perTask ? a.kind : "doc", a);
  const shown = [...latest.values()];
  const older = docs.filter((a) => !shown.includes(a)).reverse();

  return (
    <>
      <RunStrip runs={runs} />
      {shown.length === 0 && !children && <p className="pad sub empty-page">{empty}</p>}
      {shown.length === 0 && children && runs.length === 0 && (
        <p className="pad sub empty-page">{empty}</p>
      )}
      {shown.map((a) => (
        <Doc key={`${a.kind}-${a.createdAt}`} a={a} />
      ))}
      {children}
      {older.length > 0 && (
        <details className="panel older">
          <summary>Previous versions ({older.length})</summary>
          {older.map((a) => (
            <Doc
              key={`${a.kind}-${a.createdAt}`}
              a={a}
              label={`${a.title} · ${ago(a.createdAt)}`}
            />
          ))}
        </details>
      )}
    </>
  );
}

function Overview({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const w = d.workItem;
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: (action: "retry" | "cancel") =>
      call(wc.workItemAction, { params: { id: w.id }, body: note ? { action, note } : { action } }),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["wi", w.id] });
    },
  });
  const closed = w.stage === "done" || w.stage === "cancelled";
  const cost = d.agentRuns.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const tokens = d.agentRuns.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);

  return (
    <>
      <Panel title="Request">
        <dl className="facts">
          <dt>Project</dt>
          <dd className="mono">{w.projectId}</dd>
          <dt>Request</dt>
          <dd className="pre">{w.description}</dd>
          {w.note && (
            <>
              <dt>Note</dt>
              <dd className={w.status === "blocked" ? "error" : ""}>{w.note}</dd>
            </>
          )}
          <dt>Usage</dt>
          <dd>
            {d.agentRuns.length} agent runs · {Math.round(tokens / 1000)}k tokens · est. $
            {cost.toFixed(2)}
          </dd>
        </dl>
      </Panel>

      <Panel title="Pages">
        <ul className="pagelist">
          {TABS.filter((t) => t.key !== "overview").map((t) => {
            const n = countFor(t.key, d);
            return (
              <li key={t.key}>
                <a href={`#wi/${w.id}/${t.key}`}>
                  <b>{t.label}</b> <span className="sub">· {t.role}</span>
                </a>
                <span className="sub">{n ? `${n} item${n > 1 ? "s" : ""}` : "not started"}</span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {!closed && (
        <Panel title="Actions">
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
        </Panel>
      )}
    </>
  );
}

function TaskTable({ d }: { d: Detail }) {
  if (!d.tasks.length) return null;
  return (
    <Panel title={`Tasks (${d.tasks.length})`}>
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
            {d.tasks.map((t) => (
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
    </Panel>
  );
}

function DiffPanel({ id, hasTasks }: { id: string; hasTasks: boolean }) {
  const [show, setShow] = useState(false);
  const diff = useQuery({
    queryKey: ["wi-diff", id],
    queryFn: () => call(wc.workItemDiff, { params: { id } }),
    enabled: show,
  });
  if (!hasTasks) return null;
  return (
    <Panel
      title="Code changes"
      actions={
        <button type="button" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show diff"}
        </button>
      }
    >
      {show &&
        (diff.data?.diffs.length ? (
          diff.data.diffs.map((x) => (
            <div key={x.taskId} className="pad">
              <b className="mono">
                {x.taskId} · {x.branch}
              </b>{" "}
              <span className="sub">
                {x.files.length} files
                {x.withheld.length ? ` · ${x.withheld.length} secret files withheld` : ""}
              </span>
              <pre className="log diff">
                {x.patch.split("\n").map((l, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
                    key={`${x.taskId}-${i}`}
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
          <p className="pad sub">{diff.isPending ? "Loading changes…" : "No code changes yet."}</p>
        ))}
    </Panel>
  );
}
