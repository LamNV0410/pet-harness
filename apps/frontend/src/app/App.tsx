// App shell with hash routes. Views are added per milestone.
import type { HarnessEvent } from "@harness/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { call, contracts } from "../api/client";
import { ApprovalsView } from "../features/approvals/ApprovalsView";
import { ProjectDetail } from "../features/projects/ProjectDetail";
import { ProjectsView } from "../features/projects/ProjectsView";
import { RunDetail } from "../features/runs/RunDetail";
import { TimelineView } from "../features/timeline/TimelineView";
import { useEventStream } from "../state/useEventStream";

type Route =
  | { view: "projects" }
  | { view: "project"; id: string }
  | { view: "run"; id: string }
  | { view: "approvals" }
  | { view: "timeline" };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const [head, id] = h.split("/");
  if (head === "project" && id) return { view: "project", id };
  if (head === "run" && id) return { view: "run", id };
  if (head === "approvals") return { view: "approvals" };
  if (head === "timeline") return { view: "timeline" };
  return { view: "projects" };
}

const NAV: { key: Route["view"]; label: string; href: string }[] = [
  { key: "projects", label: "Projects", href: "#projects" },
  { key: "approvals", label: "Approvals", href: "#approvals" },
  { key: "timeline", label: "Timeline", href: "#timeline" },
];

const TITLES: Record<Route["view"], string> = {
  projects: "Projects",
  project: "Project",
  run: "Run",
  approvals: "Approval Center",
  timeline: "Timeline",
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
    }
    if (e.type.startsWith("approval.")) void qc.invalidateQueries({ queryKey: ["approvals"] });
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

  const activeNav = route.view === "project" || route.view === "run" ? "projects" : route.view;
  return (
    <div className="shell">
      <nav className="rail" aria-label="Views">
        <div className="brand">
          <span className={`dot ${status === "open" ? "on" : "off"}`} aria-hidden="true" />
          Furwatch Harness
        </div>
        {NAV.map((n) => (
          <a key={n.key} href={n.href} aria-current={activeNav === n.key ? "page" : undefined}>
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
          <h1>{TITLES[route.view]}</h1>
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
        {route.view === "projects" && <ProjectsView />}
        {route.view === "project" && <ProjectDetail projectId={route.id} />}
        {route.view === "run" && <RunDetail runId={route.id} />}
        {route.view === "approvals" && <ApprovalsView />}
        {route.view === "timeline" && <TimelineView events={events} />}
      </main>
    </div>
  );
}
