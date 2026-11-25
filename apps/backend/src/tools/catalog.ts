// The six M1 read-only tools (design.md §5.4). Each declares its input schema and the paths the
// permission engine must check BEFORE it runs. Secret files are excluded at the source for
// whole-repo git calls (filtered, not denied: OQ-11).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { ResolvedTarget } from "../permissions/engine.js";
import type { GlobSet } from "../permissions/glob.js";
import { git, SAFE_REF } from "./git.js";

export interface ToolContext {
  root: string;
  secrets: GlobSet;
  targets: ResolvedTarget[];
}

export interface ToolOutput {
  result: unknown;
  filtered: boolean;
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  input: S;
  /** Project-relative paths to check. `null` = the call is not allowed in this shape (e.g. bare blob). */
  targets(input: z.infer<S>): string[] | null;
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolOutput>;
}

const MAX_READ_BYTES = 256 * 1024;
const relPath = z.string().max(1024).default(".");
const ref = z.string().regex(SAFE_REF, "invalid git ref");

function excludeSpecs(secrets: GlobSet): string[] {
  return secrets.patterns.map(
    (p) => `:(exclude,glob,icase)${p.startsWith("**/") || p.includes("/") ? p : `**/${p}`}`,
  );
}

async function listRepoFiles(root: string): Promise<string[]> {
  const { stdout } = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

function def<S extends z.ZodType>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

export const TOOLS = {
  "fs.list": def({
    name: "fs.list",
    input: z.object({ path: relPath }),
    targets: (i) => [i.path],
    run: async (_i, ctx) => {
      const t = ctx.targets[0] as ResolvedTarget;
      const entries = readdirSync(t.abs, { withFileTypes: true })
        .filter((d) => d.name !== ".git")
        .slice(0, 1000)
        .map((d) => {
          const rel = t.rel === "." ? d.name : `${t.rel}/${d.name}`;
          return {
            name: d.name,
            type: d.isDirectory() ? "dir" : "file",
            secret: ctx.secrets.matches(rel),
          };
        });
      return { result: { path: t.rel, entries }, filtered: false };
    },
  }),

  "fs.read": def({
    name: "fs.read",
    input: z.object({
      path: z.string().min(1).max(1024),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
    }),
    targets: (i) => [i.path],
    run: async (i, ctx) => {
      const t = ctx.targets[0] as ResolvedTarget;
      const st = statSync(t.abs);
      if (!st.isFile()) throw new Error("not a file");
      const ranged = i.startLine !== undefined || i.endLine !== undefined;
      if (st.size > MAX_READ_BYTES && !ranged) {
        throw new Error(
          `file is ${st.size} bytes; read it with startLine/endLine (max ${MAX_READ_BYTES} bytes)`,
        );
      }
      const lines = readFileSync(t.abs, "utf8").split(/\r?\n/);
      const start = (i.startLine ?? 1) - 1;
      const end = Math.min(i.endLine ?? lines.length, lines.length);
      let content = lines.slice(start, end).join("\n");
      const truncated = Buffer.byteLength(content) > MAX_READ_BYTES;
      if (truncated) content = content.slice(0, MAX_READ_BYTES);
      return {
        result: {
          path: t.rel,
          startLine: start + 1,
          endLine: end,
          totalLines: lines.length,
          truncated,
          content,
        },
        filtered: false,
      };
    },
  }),

  "search.text": def({
    name: "search.text",
    input: z.object({ pattern: z.string().min(1).max(200), path: relPath }),
    targets: (i) => [i.path],
    run: async (i, ctx) => {
      const t = ctx.targets[0] as ResolvedTarget;
      const { stdout } = await git(ctx.root, [
        "grep",
        "-n",
        "-I",
        "--untracked",
        "-F",
        "-e",
        i.pattern,
        "--",
        t.rel,
        ...excludeSpecs(ctx.secrets),
      ]);
      const matches = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 500)
        .map((line) => {
          const m = /^(.*?):(\d+):(.*)$/.exec(line);
          return m
            ? { path: m[1] ?? "", line: Number(m[2]), text: (m[3] ?? "").slice(0, 400) }
            : null;
        })
        .filter((m) => m !== null && !ctx.secrets.matches(m.path));
      const excludedSecretPaths = (await listRepoFiles(ctx.root)).filter((f) =>
        ctx.secrets.matches(f),
      ).length;
      return {
        result: { pattern: i.pattern, matches, excludedSecretPaths },
        filtered: excludedSecretPaths > 0,
      };
    },
  }),

  "git.log": def({
    name: "git.log",
    input: z.object({
      ref: ref.default("HEAD"),
      maxCount: z.number().int().min(1).max(50).default(20),
      path: relPath,
    }),
    targets: (i) => [i.path],
    run: async (i, ctx) => {
      const t = ctx.targets[0] as ResolvedTarget;
      const { stdout } = await git(ctx.root, [
        "log",
        `-n${i.maxCount}`,
        "--format=%H%x1f%an%x1f%aI%x1f%s",
        i.ref,
        "--",
        t.rel,
      ]);
      const commits = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          const [sha, author, date, subject] = l.split("\x1f");
          return { sha, author, date, subject };
        });
      return { result: { ref: i.ref, commits }, filtered: false };
    },
  }),

  "git.show": def({
    name: "git.show",
    input: z.object({ ref, path: z.string().max(1024).optional() }),
    // A bare object id cannot be mapped to a path, so it is denied (OQ-11).
    targets: (i) => (i.path === undefined ? null : [i.path]),
    run: async (i, ctx) => {
      const t = ctx.targets[0] as ResolvedTarget;
      const { stdout } = await git(ctx.root, ["show", `${i.ref}:${t.rel}`]);
      const content = stdout.length > MAX_READ_BYTES ? stdout.slice(0, MAX_READ_BYTES) : stdout;
      return {
        result: { ref: i.ref, path: t.rel, truncated: content.length < stdout.length, content },
        filtered: false,
      };
    },
  }),

  "git.diff": def({
    name: "git.diff",
    input: z.object({
      from: ref.default("HEAD"),
      to: ref.optional(),
      paths: z.array(z.string().max(1024)).max(50).default([]),
    }),
    targets: (i) => (i.paths.length ? i.paths : ["."]),
    run: async (i, ctx) => {
      const range = i.to ? [i.from, i.to] : [i.from];
      const scope = ctx.targets.map((t) => t.rel);
      const { stdout: names } = await git(ctx.root, [
        "diff",
        "--name-only",
        ...range,
        "--",
        ...scope,
      ]);
      const changed = names.split(/\r?\n/).filter(Boolean);
      const secret = changed.filter((f) => ctx.secrets.matches(f));
      const safe = changed.filter((f) => !ctx.secrets.matches(f));
      let withheld: { path: string; added: string; removed: string }[] = [];
      if (secret.length) {
        const { stdout: num } = await git(ctx.root, [
          "diff",
          "--numstat",
          ...range,
          "--",
          ...secret,
        ]);
        withheld = num
          .split(/\r?\n/)
          .filter(Boolean)
          .map((l) => {
            const [added = "?", removed = "?", path = ""] = l.split("\t");
            return { path, added, removed };
          });
      }
      let patch = "";
      if (safe.length) {
        const { stdout } = await git(ctx.root, [
          "diff",
          ...range,
          "--",
          ...safe,
          ...excludeSpecs(ctx.secrets),
        ]);
        patch = stdout.length > MAX_READ_BYTES ? stdout.slice(0, MAX_READ_BYTES) : stdout;
      }
      return { result: { range, files: safe, withheld, patch }, filtered: withheld.length > 0 };
    },
  }),
} as const;

export type ToolKey = keyof typeof TOOLS;
export const isToolKey = (n: string): n is ToolKey => Object.hasOwn(TOOLS, n);
