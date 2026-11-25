// Build step: writes dist/openapi.json from the compiled contracts (TD-02). Tooling, not library code.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildOpenApiDocument } = await import("../dist/index.js");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const out = join(pkgDir, "dist", "openapi.json");
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(version), null, 2)}\n`);
console.log(`openapi.json written (${out})`);
