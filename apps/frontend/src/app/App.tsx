// App shell with hash routes: Dashboard, Inbox, Kanban, Approvals, Office, Projects, Runtime, Timeline.
import type { HarnessEvent } from "@harness/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { call, contracts } from "../api/client";
import { AgentRunDetail } from "../features/agents/AgentRunDetail";
import { ApprovalsView } from "../features/approvals/ApprovalsView";
import { DashboardView } from "../features/dashboard/DashboardView";
import { OfficeView } from "../features/office/OfficeView";
import { ProjectDetail } from "../features/projects/ProjectDetail";
import { ProjectsView } from "../features/projects/ProjectsView";
import { RunDetail } from "../features/runs/RunDetail";
import { RuntimeView } from "../features/runtime/RuntimeView";
import { TimelineView } from "../features/timeline/TimelineView";
import { InboxView } from "../features/workitems/InboxView";
import { KanbanView } from "../features/workitems/KanbanView";
import { WorkItemDetail } from "../features/workitems/WorkItemDetail";
import { useEventStream } from "../state/useEventStream";

type View =
  | "dashboard"
  | "inbox"
  | "kanban"
  | "approvals"
  | "office"
  | "projects"
  | "runtime"
  | "timeline"
  | "project"
  | "run"
  | "wi"
  | "agent";

interface Route {
  view: View;
  id?: string;
  tab?: string | undefined;
}

const SIMPLE: View[] = [
  "dashboard",
  "inbox",
  "kanban",
  "approvals",
  "office",
  "projects",
  "runtime",
  "timeline",
];
function parse(hash: string): Route {
  const [head, id, tab] = hash.replace(/^#/, "").split("/");
  if (head && id && ["project", "run", "wi", "agent"].includes(head))
    return { view: head as View, id, tab };
  return { view: SIMPLE.includes(head as View) ? (head as View) : "dashboard" };
}

const NAV: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inbox", label: "Requirement Inbox" },
  { key: "kanban", label: "Kanban" },
  { key: "approvals", label: "Approvals" },
  { key: "office", label: "Virtual Office" },
  { key: "projects", label: "Projects" },
  { key: "runtime", label: "Runtime" },
  { key: "timeline", label: "Timeline" },
];

const TITLE: Record<View, string> = {
  dashboard: "Dashboard",
  inbox: "Requirement Inbox",
  kanban: "Kanban",
  approvals: "Approval Center",
  office: "Virtual Office",
  projects: "Projects",
  runtime: "Runtime",
  timeline: "Timeline",
  project: "Project",
  run: "Run",
  wi: "Work item",
  agent: "Agent run",
};

const PARENT: Partial<Record<View, View>> = {
  project: "projects",
  run: "projects",
  wi: "kanban",
  agent: "kanban",
};

export function App() {
  const qc = useQueryClient();
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { events, status } = useEventStream((e: HarnessEvent) => {
    if (e.type.startsWith("project.") || e.type === "adapter.rejected")
      void qc.invalidateQueries({ queryKey: ["projects"] });
    if (e.type === "run.state_changed") {
      void qc.invalidateQueries({ queryKey: ["runs"] });
      void qc.invalidateQueries({ queryKey: ["run", e.payload.runId] });
      void qc.invalidateQueries({ queryKey: ["servers"] });
      void qc.invalidateQueries({ queryKey: ["wi"] });
    }
    if (e.type.startsWith("approval.")) {
      void qc.invalidateQueries({ queryKey: ["approvals"] });
      void qc.invalidateQueries({ queryKey: ["wi"] });
    }
    if (e.type === "workitem.changed") {
      void qc.invalidateQueries({ queryKey: ["workitems"] });
      void qc.invalidateQueries({ queryKey: ["wi", e.payload.workItemId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
    if (e.type === "agent.activity") {
      void qc.invalidateQueries({ queryKey: ["agent", e.payload.agentRunId] });
      if (e.payload.workItemId)
        void qc.invalidateQueries({ queryKey: ["wi", e.payload.workItemId] });
    }
    if (e.type === "system.started") void qc.invalidateQueries();
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => call(contracts.health),
    refetchInterval: 15_000,
  });
  const pending = useQuery({
    queryKey: ["approvals"],
    queryFn: () => call(contracts.listApprovals),
  });
  const pendingCount = pending.data?.approvals.filter((a) => a.state === "pending").length ?? 0;
  const active = PARENT[route.view] ?? route.view;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Views">
        <div className="brand">
          <span className={`dot ${status === "open" ? "on" : "off"}`} aria-hidden="true" />
          Furwatch Harness
        </div>
        {NAV.map((n) => (
          <a key={n.key} href={`#${n.key}`} aria-current={active === n.key ? "page" : undefined}>
            {n.label}
            {n.key === "approvals" && pendingCount > 0 && (
              <span className="badge">{pendingCount}</span>
            )}
            {n.key === "timeline" && <span className="count">{events.length}</span>}
          </a>
        ))}
      </nav>
      <main>
        <div className="topbar">
          <h1>{TITLE[route.view]}</h1>
          <div className="chips">
            <span className={`chip ${status === "open" ? "live" : "warn"}`}>
              {status === "open"
                ? "live"
                : status === "connecting"
                  ? "connecting…"
                  : "reconnecting…"}
            </span>
            <span className={`chip ${health.data?.db === "ok" ? "" : "warn"}`}>
              {health.data ? `v${health.data.version} · db ${health.data.db}` : "health…"}
            </span>
          </div>
        </div>
        {route.view === "dashboard" && <DashboardView />}
        {route.view === "inbox" && <InboxView />}
        {route.view === "kanban" && <KanbanView />}
        {route.view === "approvals" && <ApprovalsView />}
        {route.view === "office" && <OfficeView events={events} />}
        {route.view === "projects" && <ProjectsView />}
        {route.view === "runtime" && <RuntimeView />}
        {route.view === "timeline" && <TimelineView events={events} />}
        {route.view === "project" && route.id && <ProjectDetail projectId={route.id} />}
        {route.view === "run" && route.id && <RunDetail runId={route.id} />}
        {route.view === "wi" && route.id && <WorkItemDetail id={route.id} tab={route.tab} />}
        {route.view === "agent" && route.id && <AgentRunDetail id={route.id} />}
      </main>
    </div>
  );
}
