// One run: state, summary, live log, cancel (M2).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { call, contracts, openRunLog } from "../../api/client";
import { duration, Panel, StatePill } from "../../components/ui";

export function RunDetail({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => call(contracts.getRun, { params: { id: runId } }),
    refetchInterval: (q) =>
      q.state.data &&
      ["passed", "failed", "cancelled", "timed_out", "denied", "error", "cached"].includes(
        q.state.data.run.state,
      )
        ? false
        : 2000,
  });
  const cancel = useMutation({
    mutationFn: () => call(contracts.cancelRun, { params: { id: runId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["run", runId] }),
  });
  const [lines, setLines] = useState<{ n: number; text: string }[]>([]);
  const seq = useRef(0);
  const [ended, setEnded] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    setLines([]);
    setEnded(false);
    return openRunLog(
      runId,
      (l) => {
        seq.current += 1;
        const item = { n: seq.current, text: l };
        setLines((prev) => (prev.length > 5000 ? [...prev.slice(-4000), item] : [...prev, item]));
      },
      () => {
        setEnded(true);
        void qc.invalidateQueries({ queryKey: ["run", runId] });
      },
    );
  }, [runId, qc]);

  const lineCount = lines.length;
  useEffect(() => {
    if (lineCount && follow.current && box.current)
      box.current.scrollTop = box.current.scrollHeight;
  }, [lineCount]);

  const r = run.data?.run;
  const live = r && ["queued", "waiting_approval", "preparing", "running"].includes(r.state);
  return (
    <div className="stack">
      <p className="crumbs">
        <a href="#projects">Projects</a> /{" "}
        {r ? <a href={`#project/${r.projectId}`}>{r.projectId}</a> : "…"} / run
      </p>
      <Panel
        title={r ? `${r.commandId} · ${r.projectId}` : "Run"}
        actions={
          <>
            {r && <StatePill state={r.state} />}
            {live && (
              <button
                type="button"
                className="danger"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                Cancel
              </button>
            )}
          </>
        }
      >
        {r && (
          <dl className="facts">
            <dt>Command</dt>
            <dd className="mono">{r.argv.join(" ")}</dd>
            <dt>Base</dt>
            <dd className="mono">
              {r.baseRef} {r.sha ? `@ ${r.sha.slice(0, 12)}` : ""}
            </dd>
            <dt>Summary</dt>
            <dd>{r.summary ?? (live ? "running…" : "—")}</dd>
            <dt>Duration</dt>
            <dd className="mono">{duration(r.durationMs)}</dd>
            {r.state === "waiting_approval" && (
              <>
                <dt>Approval</dt>
                <dd>
                  Waiting for you in <a href="#approvals">Approvals</a>.
                </dd>
              </>
            )}
            {r.cachedFrom && (
              <>
                <dt>Reused</dt>
                <dd>
                  Stored verdict from <a href={`#run/${r.cachedFrom}`}>an earlier run</a> on the
                  same commit.
                </dd>
              </>
            )}
          </dl>
        )}
      </Panel>
      <Panel
        title="Log"
        actions={
          <span className="sub">
            {lines.length} lines{ended ? " · finished" : " · live"}
          </span>
        }
      >
        <pre
          ref={box}
          className="log"
          onScroll={(e) => {
            const el = e.currentTarget;
            follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
          }}
        >
          {lines.map(({ n, text: l }) => (
            <span
              key={n}
              className={
                l.startsWith("[harness]")
                  ? "h"
                  : /\b(error|failed)\b/i.test(l)
                    ? "e"
                    : /warn/i.test(l)
                      ? "w"
                      : ""
              }
            >
              {l}
              {"\n"}
            </span>
          ))}
        </pre>
      </Panel>
    </div>
  );
}
