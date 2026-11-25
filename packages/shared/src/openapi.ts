// Builds an OpenAPI 3.1 document from the contracts (design.md §4, TD-02). Pure: no I/O.
import { z } from "zod";
import { contracts } from "./contracts/index.js";
import { ErrorBody } from "./errors/index.js";

const STATUS_OF: Record<string, string> = {
  UNAUTHORIZED: "401",
  FORBIDDEN_ORIGIN: "403",
  TOOL_DENIED: "403",
  NOT_FOUND: "404",
  VALIDATION_FAILED: "400",
  INTERNAL: "500",
};

const schema = (s: z.ZodType) => z.toJSONSchema(s, { unrepresentable: "any", io: "output" });

export function buildOpenApiDocument(version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const c of Object.values(contracts)) {
    const oaPath = c.path.replace(/:([A-Za-z]+)/g, "{$1}");
    const responses: Record<string, unknown> = {
      "200": {
        description: "OK",
        content: {
          [("stream" in c && c.stream) ? "text/event-stream" : "application/json"]: {
            schema: schema(c.response),
          },
        },
      },
    };
    for (const code of c.errors) {
      const status = STATUS_OF[code] ?? "500";
      responses[status] = {
        description: code,
        content: { "application/json": { schema: schema(ErrorBody) } },
      };
    }
    const op: Record<string, unknown> = { operationId: c.id, summary: c.summary, responses };
    if ("body" in c && c.body) {
      op.requestBody = { required: true, content: { "application/json": { schema: schema(c.body) } } };
    }
    if ("query" in c && c.query) op["x-query-schema"] = schema(c.query);
    paths[oaPath] = { ...(paths[oaPath] ?? {}), [c.method.toLowerCase()]: op };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Furwatch Harness API", version },
    servers: [{ url: "http://127.0.0.1:7420" }],
    components: { securitySchemes: { session: { type: "http", scheme: "bearer" } } },
    security: [{ session: [] }],
    paths,
  };
}
