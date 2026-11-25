// Import-boundary check (WI-001 design.md §9, coding-standards.md §4).
// apps/backend and apps/frontend must never import each other: neither by relative
// path nor by package name. Both may import @harness/shared. Exits 1 on any violation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apps = {
  backend: { dir: join(root, "apps", "backend"), pkg: "@harness/backend" },
  frontend: { dir: join(root, "apps", "frontend"), pkg: "@harness/frontend" },
};
const SKIP = new Set(["node_modules", "dist", ".vite"]);
const EXT = /\.(c|m)?(t|j)sx?$/;
const SPEC =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(name)) yield p;
  }
}

const inside = (p, dir) => {
  const rel = relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
};

const violations = [];
for (const [name, app] of Object.entries(apps)) {
  const [otherName, other] = Object.entries(apps).find(([n]) => n !== name);
  for (const file of files(app.dir)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(SPEC)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (!spec) continue;
      const line = text.slice(0, m.index).split("\n").length;
      const byPackage = spec === other.pkg || spec.startsWith(`${other.pkg}/`);
      const byPath = spec.startsWith(".") && inside(resolve(dirname(file), spec), other.dir);
      if (byPackage || byPath) {
        violations.push(
          `${relative(root, file).split(sep).join("/")}:${line} imports "${spec}" -> crosses apps/${name} -> apps/${otherName}`,
        );
      }
    }
  }
}

if (violations.length) {
  console.error(`Import boundary violations (${violations.length}):\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("Import boundaries OK (apps/backend and apps/frontend do not import each other).");
