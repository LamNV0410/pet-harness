// Redacts secret-looking values from any output before it is stored, logged or returned
// (04 §4, design.md §5.4). Marker: «redacted:<kind>» (OQ-14). Deny-first, redact-second.

const RULES: ReadonlyArray<{ kind: string; re: RegExp; replace: string }> = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: "«redacted:private-key»",
  },
  {
    kind: "connection-string",
    re: /\b(Password|Pwd|AccountKey|SharedAccessKey|SharedAccessSignature)\s*=\s*[^;"'\s]+/gi,
    replace: "$1=«redacted:connection-string»",
  },
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: "«redacted:jwt»",
  },
  {
    kind: "api-key",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    replace: "«redacted:api-key»",
  },
  {
    kind: "secret-value",
    re: /(["']?[A-Za-z0-9_.-]*(?:password|passwd|secret|token|apikey|api_key|privatekey|private_key|webhooksalt)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
    replace: '$1"«redacted:secret-value»"',
  },
];

export function redactText(text: string): string {
  let out = text;
  for (const r of RULES) out = out.replace(r.re, r.replace);
  return out;
}

const SECRET_KEY =
  /(password|passwd|secret|token|apikey|api_key|authorization|privatekey|private_key)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 20) return "«redacted:too-deep»";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        SECRET_KEY.test(k) && typeof v === "string"
          ? "«redacted:secret-value»"
          : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
