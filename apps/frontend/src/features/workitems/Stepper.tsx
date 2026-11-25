// Work item progress as a timeline stepper. Agent stages are circles, PO gates are diamonds.
// Finished steps get a check, the current one shows whether an agent is working, the PO is
// needed, or it is blocked. Each step links to the page that holds its output.
import type { Stage } from "@harness/shared";

interface Step {
  stage: Stage;
  label: string;
  who: string;
  tab: string;
  gate?: boolean;
}

const STEPS: Step[] = [
  { stage: "inbox", label: "Inbox", who: "PO", tab: "overview" },
  { stage: "analysis", label: "Requirement", who: "BA", tab: "brief" },
  { stage: "gate1", label: "Gate 1", who: "PO approves", tab: "brief", gate: true },
  { stage: "design", label: "Design", who: "Architect", tab: "design" },
  { stage: "gate2", label: "Gate 2", who: "PO approves", tab: "tasks", gate: true },
  { stage: "build", label: "Build", who: "BE / FE", tab: "build" },
  { stage: "verify", label: "Verify", who: "Tester", tab: "verify" },
  { stage: "gate4", label: "Gate 4", who: "PO accepts", tab: "verify", gate: true },
  { stage: "done", label: "Done", who: "", tab: "overview" },
];

type StepState = "done" | "active" | "waiting" | "blocked" | "todo" | "cancelled";

export function Stepper({
  id,
  stage,
  status,
  current,
}: {
  id: string;
  stage: Stage;
  status: string;
  current: string;
}) {
  const cancelled = stage === "cancelled";
  const at = cancelled ? -1 : STEPS.findIndex((s) => s.stage === stage);
  const state = (i: number): StepState => {
    if (cancelled) return "cancelled";
    if (stage === "done") return "done";
    if (i < at) return "done";
    if (i > at) return "todo";
    if (status === "blocked" || status === "failed") return "blocked";
    if (status === "waiting_po" || STEPS[i]?.gate) return "waiting";
    return "active";
  };
  const progress = stage === "done" ? 100 : at <= 0 ? 0 : (at / (STEPS.length - 1)) * 100;
  const NOW: Partial<Record<StepState, string>> = {
    active: "working",
    waiting: "needs you",
    blocked: "blocked",
  };

  return (
    <nav className={`stepper${cancelled ? " is-cancelled" : ""}`} aria-label="Progress">
      <div className="st-rail" aria-hidden="true">
        <div className="st-fill" style={{ width: `${progress}%` }} />
      </div>
      <ol>
        {STEPS.map((s, i) => {
          const st = state(i);
          return (
            <li
              key={s.stage}
              className={`st st-${st}${s.gate ? " st-gate" : ""}${current === s.tab ? " st-open" : ""}`}
            >
              <a
                href={`#wi/${id}/${s.tab}`}
                aria-current={i === at ? "step" : undefined}
                title={`${s.label}${s.who ? ` · ${s.who}` : ""}`}
              >
                <span className="st-dot">
                  {st === "done" ? "✓" : st === "blocked" ? "!" : s.gate ? "" : i}
                </span>
                <span className="st-label">{s.label}</span>
                <span className="st-who">{NOW[st] ?? s.who}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {cancelled && <p className="st-cancel">Cancelled</p>}
    </nav>
  );
}
