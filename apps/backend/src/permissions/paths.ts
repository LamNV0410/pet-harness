// Path normalization for Windows and POSIX (design.md §5.5, OQ-12).
// Input paths are project-relative. Real paths are resolved (junctions, symlinks, 8.3 short names)
// and must stay inside the real project root.
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

export type PathCheck =
  | { ok: true; abs: string; rel: string; lexicalRel: string; exists: boolean }
  | { ok: false; ruleId: string; reason: string };

const DEVICE_PREFIX = /^(\\\\[?.]\\|\/\/[?.]\/)/;

function isInside(root: string, target: string): boolean {
  const rel = relative(root.toLowerCase(), target.toLowerCase());
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !win32.isAbsolute(rel));
}

const toPosix = (p: string) => p.split(sep).join("/").replace(/\\/g, "/");

export function checkPath(projectRoot: string, input: string): PathCheck {
  const raw = input.trim() === "" ? "." : input;
  if (raw.includes("\0")) return deny("fixed:path-invalid", "path contains a NUL byte");
  if (DEVICE_PREFIX.test(raw)) return deny("fixed:path-invalid", "device paths are not allowed");
  if (isAbsolute(raw) || win32.isAbsolute(raw) || raw.startsWith("\\\\") || /^[a-zA-Z]:/.test(raw)) {
    return deny("fixed:path-escape", "absolute paths are not allowed; use a project-relative path");
  }
  const segments = raw.split(/[\\/]+/);
  for (const s of segments) {
    if (s.includes(":")) return deny("fixed:path-invalid", "alternate data streams are not allowed");
    if (s !== "." && s !== ".." && /[. ]$/.test(s)) {
      return deny("fixed:path-invalid", "path segments may not end with a dot or a space");
    }
  }
  const realRoot = realpathSync.native(projectRoot);
  const lexical = resolve(projectRoot, raw);
  if (!isInside(resolve(projectRoot), lexical)) {
    return deny("fixed:path-escape", "path is outside the project root");
  }
  const exists = existsSync(lexical);
  const abs = exists ? realpathSync.native(lexical) : lexical;
  if (exists && !isInside(realRoot, abs)) {
    return deny("fixed:path-escape", "path resolves outside the project root (link or junction)");
  }
  return {
    ok: true,
    abs,
    rel: toPosix(relative(exists ? realRoot : resolve(projectRoot), abs)) || ".",
    lexicalRel: toPosix(relative(resolve(projectRoot), lexical)) || ".",
    exists,
  };
}

function deny(ruleId: string, reason: string): PathCheck {
  return { ok: false, ruleId, reason };
}
