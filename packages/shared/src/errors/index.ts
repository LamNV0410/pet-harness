// Single error shape for every Harness API response (contracts.md §1, design.md §4).
import { z } from "zod";

export const ErrorCode = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "TOOL_DENIED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}
