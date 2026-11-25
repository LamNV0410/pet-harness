// Audited tool invocation (US-6). Every call records tool.requested -> tool.decided -> (tool.started
// -> tool.finished) and a tool_calls row. Inputs and outputs are redacted before storage or return.
import { randomUUID } from "node:crypto";
import type { Logger } from "../logger.js";
import type { PermissionEngine } from "../permissions/engine.js";
import { redact } from "../permissions/redactor.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Store } from "../store/index.js";
import { isToolKey, TOOLS, type ToolDef } from "./catalog.js";

export type InvokeOutcome =
  | { kind: "ok"; toolCallId: string; ruleId: string; filtered: boolean; result: unknown }
  | { kind: "denied"; toolCallId: string; ruleId: string; reason: string }
  | { kind: "invalid"; toolCallId: string; issues: string[] }
  | { kind: "failed"; toolCallId: string; ruleId: string; error: string };

const PREVIEW_BYTES = 4 * 1024;

export class ToolService {
  constructor(
    private readonly store: Store,
    private readonly engine: PermissionEngine,
    private readonly projects: ProjectRegistry,
    private readonly logger: Logger,
  ) {}

  async invoke(tool: string, role: string, projectId: string, input: Record<string, unknown>): Promise<InvokeOutcome> {
    const toolCallId = randomUUID();
    const correlationId = `tool:${toolCallId}`;
    const safeInput = redact(input);
    const requestedId = this.store.transaction((tx) =>
      tx.emit("tool.requested", role, { toolCallId, tool, role, projectId, input: safeInput }, { correlationId }),
    );

    const decide = (decision: "allow" | "deny", ruleId: string, reason: string) =>
      this.store.transaction((tx) => {
        tx.db
          .prepare(
            "INSERT INTO tool_calls (id, ts, tool, role, project_id, args_redacted, decision, rule_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(toolCallId, new Date().toISOString(), tool, role, projectId, JSON.stringify(safeInput), decision, ruleId, decision === "allow" ? "pending" : "denied");
        tx.checkpoint("afterStateWrite");
        return tx.emit("tool.decided", "permissions", { toolCallId, tool, decision, ruleId, reason }, { correlationId, causationId: requestedId });
      });

    // Schema validation happens first, but unknown tools/roles are engine denials (OQ-13).
    let def: ToolDef | undefined;
    let parsedInput: unknown = input;
    if (isToolKey(tool)) {
      def = TOOLS[tool] as unknown as ToolDef;
      const parsed = def.input.safeParse(input);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`);
        decide("deny", "fixed:invalid-input", issues.join("; "));
        this.audit(tool, role, "deny", "fixed:invalid-input");
        return { kind: "invalid", toolCallId, issues };
      }
      parsedInput = parsed.data;
    }

    const targets = def ? def.targets(parsedInput) : [];
    const scope = this.projects.scope(projectId);
    const verdict =
      def && targets === null
        ? ({ decision: "deny", ruleId: "fixed:bare-object", reason: "use <ref>:<path>; bare object ids cannot be checked" } as const)
        : this.engine.evaluate(tool, role, scope, targets ?? []);
    const decidedId = decide(verdict.decision, verdict.ruleId, verdict.reason);
    this.audit(tool, role, verdict.decision, verdict.ruleId);
    if (verdict.decision === "deny" || !def || !scope) {
      return { kind: "denied", toolCallId, ruleId: verdict.ruleId, reason: verdict.reason };
    }

    const startedId = this.store.transaction((tx) =>
      tx.emit("tool.started", role, { toolCallId, tool }, { correlationId, causationId: decidedId }),
    );
    const t0 = performance.now();
    let outcome: InvokeOutcome;
    let outputBytes = 0;
    let preview: string | null = null;
    let filtered = false;
    let error: string | null = null;
    try {
      const out = await def.run(parsedInput, { root: scope.root, secrets: scope.secrets, targets: verdict.paths });
      const result = redact(out.result);
      const json = JSON.stringify(result);
      outputBytes = Buffer.byteLength(json);
      preview = json.slice(0, PREVIEW_BYTES);
      filtered = out.filtered;
      outcome = { kind: "ok", toolCallId, ruleId: verdict.ruleId, filtered, result };
    } catch (err) {
      error = String(redact((err as Error).message));
      outcome = { kind: "failed", toolCallId, ruleId: verdict.ruleId, error };
    }
    const durationMs = Math.round(performance.now() - t0);
    this.store.transaction((tx) => {
      tx.db
        .prepare("UPDATE tool_calls SET status = ?, duration_ms = ?, output_preview = ?, error = ? WHERE id = ?")
        .run(error ? "failed" : "finished", durationMs, preview, error, toolCallId);
      tx.emit(
        "tool.finished",
        role,
        { toolCallId, tool, ok: error === null, durationMs, outputBytes, filtered, error },
        { correlationId, causationId: startedId },
      );
    });
    this.logger.info("tool.finished", { tool, role, projectId, ok: error === null, durationMs, outputBytes, filtered });
    return outcome;
  }

  private audit(tool: string, role: string, decision: string, ruleId: string): void {
    this.logger.info("tool.decided", { tool, role, decision, ruleId });
  }
}
