// Project registry from adapters/*.yaml (design.md §5.3, US-5). Invalid adapters are rejected with
// clear messages while the rest still load; a missing path makes the project "unavailable".
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { AdapterFile, type Project } from "@harness/shared";
import { parse as parseYaml } from "yaml";
import type { PermissionEngine, ProjectScope } from "../permissions/engine.js";
import type { GlobSet } from "../permissions/glob.js";
import type { Store } from "../store/index.js";

interface Entry {
  project: Project;
  root: string;
  secrets: GlobSet;
}

export interface ReloadResult {
  projects: Project[];
  rejected: { file: string; errors: string[] }[];
}

export class ProjectRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly store: Store,
    private readonly engine: PermissionEngine,
    private readonly adaptersDir: string,
    private readonly harnessRoot: string,
  ) {}

  load(): ReloadResult {
    const rejected: ReloadResult["rejected"] = [];
    const files = existsSync(this.adaptersDir)
      ? readdirSync(this.adaptersDir)
          .filter((f) => /\.ya?ml$/i.test(f))
          .sort()
      : [];
    const seen = new Set<string>();
    for (const file of files) {
      let raw: unknown;
      try {
        raw = parseYaml(readFileSync(join(this.adaptersDir, file), "utf8"));
      } catch (err) {
        rejected.push({ file, errors: [`YAML parse error: ${(err as Error).message}`] });
        continue;
      }
      const parsed = AdapterFile.safeParse(raw);
      if (!parsed.success) {
        rejected.push({
          file,
          errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
        });
        continue;
      }
      const a = parsed.data;
      if (seen.has(a.id)) {
        rejected.push({ file, errors: [`duplicate project id "${a.id}"`] });
        continue;
      }
      seen.add(a.id);
      const root = resolve(this.harnessRoot, a.path);
      const available = existsSync(root) && statSync(root).isDirectory();
      const project: Project = {
        id: a.id,
        name: a.name,
        path: a.path,
        baseRef: a.baseRef,
        status: available ? "available" : "unavailable",
        reason: available ? null : `path not found: ${a.path}`,
        secretPaths: a.secretPaths,
      };
      this.upsert(project);
      this.entries.set(a.id, { project, root, secrets: this.engine.secretSetFor(a.secretPaths) });
    }
    if (rejected.length) {
      this.store.transaction((tx) => {
        for (const r of rejected) tx.emit("adapter.rejected", "system", r);
      });
    }
    return { projects: this.list(), rejected };
  }

  private upsert(p: Project): void {
    this.store.transaction((tx) => {
      const prev = tx.db
        .prepare("SELECT status, reason, name, path, base_ref FROM projects WHERE id = ?")
        .get(p.id) as
        | { status: string; reason: string | null; name: string; path: string; base_ref: string }
        | undefined;
      tx.db
        .prepare(
          `INSERT INTO projects (id, name, path, base_ref, status, reason, secret_paths, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, path=excluded.path, base_ref=excluded.base_ref,
             status=excluded.status, reason=excluded.reason, secret_paths=excluded.secret_paths,
             updated_at=excluded.updated_at`,
        )
        .run(
          p.id,
          p.name,
          p.path,
          p.baseRef,
          p.status,
          p.reason,
          JSON.stringify(p.secretPaths),
          new Date().toISOString(),
        );
      tx.checkpoint("afterStateWrite");
      const correlationId = `project:${p.id}`;
      if (!prev || prev.name !== p.name || prev.path !== p.path || prev.base_ref !== p.baseRef) {
        tx.emit(
          "project.registered",
          "system",
          {
            projectId: p.id,
            name: p.name,
            path: p.path,
            baseRef: p.baseRef,
            status: p.status,
            reason: p.reason,
          },
          { correlationId },
        );
      } else if (prev.status !== p.status || prev.reason !== p.reason) {
        tx.emit(
          "project.status_changed",
          "system",
          { projectId: p.id, status: p.status, reason: p.reason },
          { correlationId },
        );
      }
    });
  }

  list(): Project[] {
    return [...this.entries.values()].map((e) => e.project);
  }

  scope(id: string): ProjectScope | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    return { id, root: e.root, available: e.project.status === "available", secrets: e.secrets };
  }
}
