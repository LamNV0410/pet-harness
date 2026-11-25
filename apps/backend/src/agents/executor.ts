// Claude Code CLI executor (TD-12). One `claude -p` process per agent run, in the run's worktree,
// with a Harness-generated settings file whose PreToolUse HTTP hook sends every tool call to the
// Harness policy (fails closed). Stream-json output becomes activity rows and agent.activity events.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Activity, AgentRole } from "@harness/shared";
import type { Logger } from "../logger.js";
import { redactText } from "../permissions/redactor.js";
import { killTree } from "../runtime/process.js";
import type { Store } from "../store/index.js";

export interface ExecOptions {
  agentRunId: string;
  workItemId: string;
  role: AgentRole;
  cwd: string;
  addDirs: string[];
  prompt: string;
  systemPrompt: string;
  tools: string[];
  maxTurns: number;
  timeoutMinutes: number;
}

export interface ExecResult {
  ok: boolean;
  output: string | null;
  sessionId: string | null;
  turns: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
}

export function claudeBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.HARNESS_CLAUDE_BIN,
    join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export class AgentExecutor {
  private readonly running = new Map<string, number>();

  constructor(
    private readonly store: Store,
    private readonly logger: Logger,
    private readonly home: string,
    private readonly hookUrl: () => string,
    private readonly token: string,
  ) {}

  activity(
    agentRunId: string,
    workItemId: string,
    role: string,
    kind: Activity["kind"],
    text: string,
  ): void {
    const safe = redactText(text).slice(0, 2000);
    this.store.transaction((tx) => {
      tx.db
        .prepare("INSERT INTO agent_activity (agent_run_id, ts, kind, text) VALUES (?, ?, ?, ?)")
        .run(agentRunId, new Date().toISOString(), kind, safe);
      tx.emit(
        "agent.activity",
        role,
        { agentRunId, role, workItemId, state: kind, text: safe.slice(0, 300) },
        { correlationId: workItemId },
      );
    });
  }

  cancel(agentRunId: string): boolean {
    const pid = this.running.get(agentRunId);
    if (pid) killTree(pid);
    return !!pid;
  }

  run(o: ExecOptions): Promise<ExecResult> {
    const bin = claudeBin();
    if (!bin) {
      return Promise.resolve(
        fail("Claude Code CLI not found. Install it and run `claude` then /login once."),
      );
    }
    const dir = join(this.home, "agents", o.agentRunId);
    mkdirSync(dir, { recursive: true });
    const systemFile = join(dir, "system.md");
    const settingsFile = join(dir, "settings.json");
    const transcript = join(dir, "stream.jsonl");
    writeFileSync(systemFile, o.systemPrompt);
    writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "*",
                hooks: [
                  {
                    type: "http",
                    url: `${this.hookUrl()}?run=${encodeURIComponent(o.agentRunId)}`,
                    headers: { Authorization: `Bearer ${this.token}` },
                    timeout: 30,
                    onFailure: "block",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    const sessionId = randomUUID();
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      String(o.maxTurns),
      "--append-system-prompt-file",
      systemFile,
      "--settings",
      settingsFile,
      "--setting-sources",
      "project,local",
      "--strict-mcp-config",
      "--permission-mode",
      "dontAsk",
      "--session-id",
      sessionId,
      "--tools",
      o.tools.join(","),
      "--allowedTools",
      o.tools.join(","),
      ...o.addDirs.flatMap((d) => ["--add-dir", d]),
    ];
    if (process.env.HARNESS_AGENT_MODEL) args.push("--model", process.env.HARNESS_AGENT_MODEL);

    return new Promise<ExecResult>((resolve) => {
      // A .mjs/.js "CLI" (the fake executor in scripts/) runs under this Node.
      const script = /\.m?js$/.test(bin);
      const child = spawn(script ? process.execPath : bin, script ? [bin, ...args] : args, {
        cwd: o.cwd,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "furwatch-harness" },
        shell: false,
        windowsHide: true,
      });
      if (child.pid) this.running.set(o.agentRunId, child.pid);
      child.stdin.end(o.prompt);
      const result: ExecResult = { ...fail("agent ended without a result"), sessionId };
      let buf = "";
      const errLines: string[] = [];
      const timer = setTimeout(() => {
        result.error = `timed out after ${o.timeoutMinutes} min`;
        if (child.pid) killTree(child.pid);
      }, o.timeoutMinutes * 60_000);

      const handle = (line: string) => {
        if (!line.trim()) return;
        appendFileSync(transcript, `${redactText(line)}\n`);
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = msg.type;
        if (type === "system" && msg.subtype === "init") {
          this.activity(
            o.agentRunId,
            o.workItemId,
            o.role,
            "info",
            `session started (${String(msg.model ?? "model")})`,
          );
        } else if (type === "assistant") {
          const content = ((msg.message as { content?: unknown[] } | undefined)?.content ??
            []) as Record<string, unknown>[];
          for (const c of content) {
            if (c.type === "text" && typeof c.text === "string" && c.text.trim()) {
              this.activity(o.agentRunId, o.workItemId, o.role, "text", c.text.trim());
            } else if (c.type === "tool_use") {
              const input = (c.input ?? {}) as Record<string, unknown>;
              const target =
                input.file_path ?? input.path ?? input.pattern ?? input.notebook_path ?? "";
              this.activity(
                o.agentRunId,
                o.workItemId,
                o.role,
                "tool",
                `${String(c.name)} ${String(target)}`.trim(),
              );
            }
          }
        } else if (type === "result") {
          const usage = (msg.usage ?? {}) as Record<string, number>;
          result.output = typeof msg.result === "string" ? redactText(msg.result) : null;
          result.ok = msg.is_error !== true && msg.subtype === "success";
          result.turns = typeof msg.num_turns === "number" ? msg.num_turns : null;
          result.costUsd = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null;
          result.inputTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0);
          result.outputTokens = usage.output_tokens ?? null;
          result.sessionId = typeof msg.session_id === "string" ? msg.session_id : sessionId;
          result.error = result.ok
            ? null
            : redactText(String(msg.result ?? msg.subtype ?? "agent error")).slice(0, 500);
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const l of lines) handle(l);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c: string) => errLines.push(redactText(c)));
      child.on("error", (e) => {
        clearTimeout(timer);
        this.running.delete(o.agentRunId);
        resolve({ ...result, ok: false, error: `failed to start claude: ${e.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (buf) handle(buf);
        this.running.delete(o.agentRunId);
        if (!result.ok && result.error === "agent ended without a result") {
          result.error = `claude exited ${code}: ${errLines.join("").trim().slice(0, 500) || "no output"}`;
        }
        this.logger.info("agent.finished", {
          agentRunId: o.agentRunId,
          role: o.role,
          ok: result.ok,
          turns: result.turns,
        });
        resolve(result);
      });
    });
  }
}

function fail(error: string): ExecResult {
  return {
    ok: false,
    output: null,
    sessionId: null,
    turns: null,
    costUsd: null,
    inputTokens: null,
    outputTokens: null,
    error,
  };
}
