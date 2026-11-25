// App shell: two views behind hash tabs (no router library in M1, design.md §6).
import type { HarnessEvent } from "@harness/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ProjectsView } from "../features/projects/ProjectsView";
import { TimelineView } from "../features/timeline/TimelineView";
import { useEventStream } from "../state/useEventStream";

type View = "projects" | "timeline";
const readView = (): View => (location.hash === "#timeline" ? "timeline" : "projects");

export function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>(readView);
  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const { events, status } = useEventStream((e: HarnessEvent) => {
    if (e.type.startsWith("project.") || e.type === "adapter.rejected") {
      void qc.invalidateQueries({ queryKey: ["projects"] });
    }
    if (e.type === "system.started") void qc.invalidateQueries();
  });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 15_000 });

  return (
    <div className="shell">
      <nav className="rail" aria-label="Views">
        <div className="brand">
          <span className={`dot ${status === "open" ? "on" : "off"}`} aria-hidden="true" />
          Furwatch Harness
        </div>
        <a href="#projects" aria-current={view === "projects" ? "page" : undefined}>
          Projects
        </a>
        <a href="#timeline" aria-current={view === "timeline" ? "page" : undefined}>
          Timeline <span className="count">{events.length}</span>
        </a>
        <p className="rail-note sub">Approvals, Kanban and the Virtual Office arrive in M3–M5.</p>
      </nav>
      <main>
        <div className="topbar">
          <h1>{view === "projects" ? "Projects" : "Timeline"}</h1>
          <div className="chips">
            <span className={`chip ${status === "open" ? "live" : "warn"}`}>
              {status === "open"
                ? "live stream"
                : status === "connecting"
                  ? "connecting…"
                  : "reconnecting…"}
            </span>
            <span className="chip">{location.host}</span>
            <span className={`chip ${health.data?.db === "ok" ? "" : "warn"}`}>
              {health.data ? `v${health.data.version} · db ${health.data.db}` : "health…"}
            </span>
          </div>
        </div>
        {view === "projects" ? <ProjectsView /> : <TimelineView events={events} />}
      </main>
    </div>
  );
}
