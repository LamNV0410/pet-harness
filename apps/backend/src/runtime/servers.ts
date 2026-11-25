// Product servers (M6, TD-13). Every start needs a fresh PO approval. The server runs from a worktree
// at the base ref with the adapter's env (furwatch-api: Development → dev/test DB), is health-probed,
// and is stopped automatically after its max runtime.
import { join } from "node:path";
import type { ServerStatus } from "@harness/shared";
import type { ApprovalService } from "../approvals/index.js";
import type { Logger } from "../logger.js";
import { redactText } from "../permissions/redactor.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Store } from "../store/index.js";
import { resolveArgv, runProcess, type Spawned, type Toolchains } from "./process.js";
import { addWorktree, fetchOrigin, removeWorktree, resolveSha } from "./worktrees.js";

interface Live {
  status: ServerStatus;
  proc: Spawned | null;
  worktree: string | null;
  stopTimer: NodeJS.Timeout | null;
  probe: NodeJS.Timeout | null;
}

export class ServerError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "VALIDATION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

export class ServerManager {
  private readonly live = new Map<string, Live>();

  constructor(
    private readonly store: Store,
    private readonly projects: ProjectRegistry,
    private readonly approvals: ApprovalService,
    private readonly logger: Logger,
    private readonly toolchains: Toolchains,
    private readonly home: string,
  ) {}

  list(): ServerStatus[] {
    return this.projects
      .list()
      .filter((p) => this.projects.adapter(p.id)?.commands.run)
      .map((p) => this.live.get(p.id)?.status ?? this.blank(p.id));
  }

  private blank(projectId: string): ServerStatus {
    return {
      projectId,
      commandId: "run",
      state: "stopped",
      url: null,
      pid: null,
      startedAt: null,
      stopsAt: null,
      lastHealth: null,
      sha: null,
      approvalId: null,
    };
  }

  private set(projectId: string, patch: Partial<ServerStatus>): ServerStatus {
    const cur = this.live.get(projectId) ?? {
      status: this.blank(projectId),
      proc: null,
      worktree: null,
      stopTimer: null,
      probe: null,
    };
    cur.status = { ...cur.status, ...patch };
    this.live.set(projectId, cur);
    this.store.transaction((tx) =>
      tx.emit(
        "run.state_changed",
        "runtime",
        {
          runId: `server:${projectId}`,
          projectId,
          commandId: "run",
          state: mapState(cur.status.state),
          sha: cur.status.sha,
          exitCode: null,
          summary: `server ${cur.status.state}${cur.status.url ? ` · ${cur.status.url}` : ""}`,
        },
        { correlationId: `server:${projectId}` },
      ),
    );
    return cur.status;
  }

  start(projectId: string): ServerStatus {
    const adapter = this.projects.adapter(projectId);
    const cmd = adapter?.commands.run;
    if (!adapter || !cmd)
      throw new ServerError("NOT_FOUND", "this project declares no server command");
    const st = this.live.get(projectId)?.status.state ?? "stopped";
    if (!["stopped", "failed"].includes(st))
      throw new ServerError("VALIDATION_FAILED", `server is ${st}`);
    const port = cmd.port ?? 0;
    const minutes = cmd.maxRuntimeMinutes ?? 15;
    const effects =
      projectId === "furwatch-api"
        ? [
            "Uses the dev/test database from appsettings.Development.json (TD-13)",
            "Startup seeds/backfills that database",
            "Hangfire jobs may send real push notifications and emails",
            "Uses the real Firebase / SMTP / Blob configuration",
            `Stops automatically after ${minutes} minutes`,
          ]
        : [`Starts the dev server on port ${port}`, `Stops automatically after ${minutes} minutes`];
    const a = this.approvals.request({
      kind: "command",
      title: `Start ${projectId} server`,
      detail: `${cmd.argv.join(" ")}\nenv ${
        Object.entries(cmd.env)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ") || "(none)"
      } · base ${adapter.baseRef} · port ${port || "?"}`,
      effects,
      requestedBy: "po",
      subjectId: `server:${projectId}`,
      payload: { projectId, argv: cmd.argv, env: cmd.env, at: Date.now() },
    });
    this.set(projectId, { state: "waiting_approval", approvalId: a.id });
    this.approvals.onDecided(a.id, (d) => {
      if (d === "approved") void this.launch(projectId);
      else this.set(projectId, { state: "stopped", approvalId: null });
    });
    return this.live.get(projectId)?.status as ServerStatus;
  }

  private async launch(projectId: string): Promise<void> {
    const adapter = this.projects.adapter(projectId);
    const scope = this.projects.scope(projectId);
    const cmd = adapter?.commands.run;
    if (!adapter || !scope || !cmd) return;
    const live = this.live.get(projectId) as Live;
    try {
      this.set(projectId, { state: "starting", startedAt: new Date().toISOString() });
      await fetchOrigin(scope.root).catch(() => undefined);
      const sha = await resolveSha(scope.root, adapter.baseRef);
      const wt = await addWorktree(
        scope.root,
        join(this.home, "worktrees", projectId),
        `server-${Date.now().toString(36)}`,
        sha,
      );
      live.worktree = wt;
      const port = cmd.port ?? 0;
      const url = port ? `http://127.0.0.1:${port}` : null;
      const minutes = cmd.maxRuntimeMinutes ?? 15;
      const r = resolveArgv(cmd.argv, cmd.toolchain, this.toolchains);
      const logs: string[] = [];
      live.proc = runProcess({
        file: r.file,
        args: r.args,
        cwd: wt,
        env: cmd.env,
        pathPrefix: r.pathPrefix,
        timeoutMs: (minutes + 1) * 60_000,
        onLine: (l) => {
          logs.push(redactText(l));
          if (logs.length > 200) logs.shift();
        },
      });
      this.set(projectId, {
        sha,
        url,
        pid: live.proc.child.pid ?? null,
        stopsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      });
      live.stopTimer = setTimeout(
        () => void this.stop(projectId, "max runtime reached"),
        minutes * 60_000,
      );
      const health = this.projects.adapter(projectId)?.health?.path ?? "/";
      live.probe = setInterval(() => {
        if (!url) return;
        fetch(`${url}${health}`, { signal: AbortSignal.timeout(4000) })
          .then((res) =>
            this.set(projectId, {
              state: res.ok ? "healthy" : "unhealthy",
              lastHealth: `${res.status} @ ${new Date().toLocaleTimeString()}`,
            }),
          )
          .catch(() => {
            const s = this.live.get(projectId)?.status.state;
            if (s === "healthy")
              this.set(projectId, {
                state: "unhealthy",
                lastHealth: `no response @ ${new Date().toLocaleTimeString()}`,
              });
          });
      }, 4000);
      const res = await live.proc.done;
      if (live.probe) clearInterval(live.probe);
      if (live.stopTimer) clearTimeout(live.stopTimer);
      const st = this.live.get(projectId)?.status.state;
      this.set(projectId, {
        state: st === "stopping" ? "stopped" : "failed",
        pid: null,
        lastHealth:
          st === "stopping"
            ? (this.live.get(projectId)?.status.lastHealth ?? null)
            : `exited ${res.exitCode ?? "?"}: ${logs.slice(-3).join(" | ").slice(0, 300)}`,
      });
    } catch (err) {
      this.set(projectId, {
        state: "failed",
        lastHealth: redactText((err as Error).message).slice(0, 300),
      });
    } finally {
      if (live.worktree) await removeWorktree(scope.root, live.worktree).catch(() => undefined);
      live.worktree = null;
      live.proc = null;
    }
  }

  async stop(projectId: string, reason = "stopped by the PO"): Promise<ServerStatus> {
    const live = this.live.get(projectId);
    if (!live) throw new ServerError("NOT_FOUND", "server is not running");
    if (live.status.state === "waiting_approval" && live.status.approvalId) {
      this.approvals.expire(live.status.approvalId);
      return this.set(projectId, { state: "stopped", approvalId: null });
    }
    if (live.proc) {
      this.logger.info("server.stop", { projectId, reason });
      this.set(projectId, { state: "stopping" });
      live.proc.cancel();
    }
    return live.status;
  }

  stopAll(): void {
    for (const [id, l] of this.live) if (l.proc) void this.stop(id, "Harness shutting down");
  }
}

function mapState(s: ServerStatus["state"]) {
  if (s === "healthy") return "passed" as const;
  if (s === "failed" || s === "unhealthy") return "failed" as const;
  if (s === "waiting_approval") return "waiting_approval" as const;
  if (s === "stopped") return "cancelled" as const;
  return "running" as const;
}
