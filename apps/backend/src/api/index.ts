// HTTP app factory (design.md §5, T5). Every /api route is registered from a shared contract
// object (OQ-15). buildApp() is used in-process by tests and bound to 127.0.0.1 by main.ts.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import {
  type ContractDef,
  contracts,
  type ErrorCode,
  EventStreamQuery,
  EventsQuery,
  errorBody,
  ToolInvokeRequest,
} from "@harness/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type RouteHandlerMethod } from "fastify";
import type { Config } from "../config/index.js";
import { openStream, parseResume } from "../events/index.js";
import type { Logger } from "../logger.js";
import type { ProjectRegistry } from "../projects/index.js";
import type { Store } from "../store/index.js";
import type { ToolService } from "../tools/service.js";
import { allowedHosts, allowedOrigins, tokenMatches } from "./security.js";

export interface AppDeps {
  config: Config;
  store: Store;
  projects: ProjectRegistry;
  tools: ToolService;
  logger: Logger;
  token: string;
  /** Actual listening port (known after listen when HARNESS_PORT=0). */
  port: () => number;
  /** Feature route modules (runs, approvals, agents, workflow, runtime). */
  modules?: ReadonlyArray<(kit: RouteKit) => void>;
}

export interface RouteKit {
  route: (c: ContractDef, handler: RouteHandlerMethod) => void;
  fail: typeof fail;
}

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN_ORIGIN: 403,
  TOOL_DENIED: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  INTERNAL: 500,
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

export function fail(reply: FastifyReply, code: ErrorCode, message: string, details?: unknown) {
  return reply
    .code(STATUS[code])
    .type("application/json")
    .send(errorBody(code, message, details));
}

export const registeredContracts: ContractDef[] = [];

export function buildApp(deps: AppDeps): FastifyInstance {
  const { config, store, projects, tools, logger, token } = deps;
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  registeredContracts.length = 0;
  const route = (c: ContractDef, handler: RouteHandlerMethod) => {
    registeredContracts.push(c);
    app.route({ method: c.method, url: c.path, handler });
  };

  // ---- Host -> Origin -> token ------------------------------------------------------------
  app.addHook("onRequest", async (req, reply) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!allowedHosts(deps.port(), config.dev).has(host)) {
      return fail(reply, "FORBIDDEN_ORIGIN", "Host header is not allowed");
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins(deps.port(), config.dev).has(origin)) {
      return fail(reply, "FORBIDDEN_ORIGIN", "Origin is not allowed");
    }
    if (req.method === "OPTIONS")
      return fail(reply, "FORBIDDEN_ORIGIN", "CORS preflight is not supported");
    if (!req.url.startsWith("/api/")) return; // static UI is served without a token
    const auth = req.headers.authorization;
    let given = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const pathOnly = req.url.split("?")[0] ?? "";
    if (given === undefined && pathOnly.endsWith("/stream")) {
      given = (req.query as { token?: string }).token;
    }
    if (!tokenMatches(token, given))
      return fail(reply, "UNAUTHORIZED", "Missing or invalid session token");
  });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode && e.statusCode < 500) return fail(reply, "VALIDATION_FAILED", e.message);
    logger.error("unhandled", { message: e.message });
    return fail(reply, "INTERNAL", "Internal error");
  });

  // ---- API routes (all from shared contracts) ---------------------------------------------
  route(contracts.health, async (_req, reply) => {
    const ok = store.ping();
    return reply
      .code(ok ? 200 : 503)
      .send({ status: ok ? "ok" : "degraded", version: config.version, db: ok ? "ok" : "error" });
  });

  route(contracts.listProjects, async () => ({ projects: projects.list() }));

  route(contracts.reloadProjects, async () => projects.load());

  route(contracts.listEvents, async (req, reply) => {
    const q = EventsQuery.safeParse(req.query);
    if (!q.success) return fail(reply, "VALIDATION_FAILED", "Invalid query", q.error.issues);
    return { events: store.listEvents(q.data.since ?? 0, q.data.limit ?? 100) };
  });

  route(contracts.eventStream, async (req, reply) => {
    const q = EventStreamQuery.safeParse(req.query);
    const lastId = req.headers["last-event-id"];
    const since = parseResume(
      typeof lastId === "string" ? lastId : undefined,
      q.success && q.data.since !== undefined
        ? String(q.data.since)
        : (req.query as { since?: string }).since,
    );
    if (since === null || !q.success)
      return fail(
        reply,
        "VALIDATION_FAILED",
        "Last-Event-ID / since must be a non-negative integer",
      );
    reply.hijack();
    openStream(store, reply.raw, since);
  });

  route(contracts.invokeTool, async (req, reply) => {
    const body = ToolInvokeRequest.safeParse(req.body ?? {});
    if (!body.success)
      return fail(reply, "VALIDATION_FAILED", "Invalid request body", body.error.issues);
    const tool = (req.params as { tool: string }).tool;
    const out = await tools.invoke(tool, body.data.role, body.data.projectId, body.data.input);
    switch (out.kind) {
      case "ok":
        return {
          toolCallId: out.toolCallId,
          decision: "allow",
          ruleId: out.ruleId,
          filtered: out.filtered,
          result: out.result,
        };
      case "denied":
        return fail(reply, "TOOL_DENIED", out.reason, {
          toolCallId: out.toolCallId,
          ruleId: out.ruleId,
        });
      case "invalid":
        return fail(reply, "VALIDATION_FAILED", "Invalid tool input", {
          toolCallId: out.toolCallId,
          issues: out.issues,
        });
      case "failed":
        return reply.code(422).send(
          errorBody("VALIDATION_FAILED", out.error, {
            toolCallId: out.toolCallId,
            ruleId: out.ruleId,
          }),
        );
    }
  });

  for (const m of deps.modules ?? []) m({ route, fail });

  // ---- Static UI with the session token injected (design.md §5.1) --------------------------
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return fail(reply, "NOT_FOUND", "No such API route");
    if (req.method !== "GET") return fail(reply, "NOT_FOUND", "Not found");
    const dist = config.frontendDist;
    const urlPath = decodeURIComponent((req.url.split("?")[0] ?? "/").replace(/^\/+/, ""));
    const candidate = resolve(dist, urlPath || "index.html");
    const inside = !relative(dist, candidate).startsWith("..");
    const file =
      inside && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : resolve(dist, "index.html");
    if (!existsSync(file)) {
      return reply
        .type("text/html; charset=utf-8")
        .send(
          "<p>Harness UI is not built yet. Run <code>pnpm build</code> in the harness folder.</p>",
        );
    }
    const ext = extname(file);
    if (ext === ".html") {
      const html = readFileSync(file, "utf8").replace(
        "</head>",
        `  <meta name="harness-session-token" content="${token}" />\n  </head>`,
      );
      return reply
        .header("Cache-Control", "no-store")
        .type(MIME[".html"] as string)
        .send(html);
    }
    return reply.type(MIME[ext] ?? "application/octet-stream").send(readFileSync(file));
  });

  return app;
}
