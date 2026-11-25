// Minimal, dependency-free glob matcher for secret/generated path lists. Case-insensitive (design.md §5.5).
// Supports `**` (any depth), `*` (within a segment) and `?`. Paths are project-relative, forward slashes.

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}

export class GlobSet {
  private readonly res: RegExp[];
  constructor(readonly patterns: readonly string[]) {
    this.res = patterns.map(globToRegExp);
  }
  /** True when `relPath` itself matches, or any of its parent directories matches. */
  matches(relPath: string): boolean {
    const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    if (this.res.some((r) => r.test(p))) return true;
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      if (this.res.some((r) => r.test(prefix) || r.test(`${prefix}/`))) return true;
    }
    return false;
  }
}
