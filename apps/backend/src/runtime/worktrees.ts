// Git worktree lifecycle (TD-07). Worktrees live under HARNESS_HOME/worktrees and are created
// detached at a resolved SHA, so the PO's checkout and branches are never touched.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { git } from "../tools/git.js";

export async function fetchOrigin(repo: string): Promise<void> {
  await git(repo, ["fetch", "origin", "--prune", "--no-tags"], 120_000);
}

export async function resolveSha(repo: string, ref: string): Promise<string> {
  const { stdout } = await git(repo, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
  return stdout.trim();
}

export async function addWorktree(
  repo: string,
  root: string,
  name: string,
  sha: string,
): Promise<string> {
  mkdirSync(root, { recursive: true });
  const path = join(root, name);
  await git(repo, ["worktree", "add", "--detach", path, sha], 300_000);
  return path;
}

/** Worktree on a new local task branch (M4). The branch lives in the product repo, never pushed. */
export async function addBranchWorktree(
  repo: string,
  root: string,
  name: string,
  branch: string,
  sha: string,
): Promise<string> {
  mkdirSync(root, { recursive: true });
  const path = join(root, name);
  if (existsSync(path)) return path;
  await git(repo, ["worktree", "add", "-B", branch, path, sha], 300_000);
  return path;
}

/**
 * Removes secret files from an agent worktree so no tool (Read, Grep, Glob) can ever see them.
 * They are marked skip-worktree first, so the deletion never shows up in status or commits.
 */
export async function stripSecrets(
  worktree: string,
  isSecret: (rel: string) => boolean,
): Promise<number> {
  const { stdout } = await git(worktree, ["ls-files", "-z"]);
  const secrets = stdout.split("\0").filter((f) => f && isSecret(f));
  for (let i = 0; i < secrets.length; i += 50) {
    await git(worktree, ["update-index", "--skip-worktree", "--", ...secrets.slice(i, i + 50)]);
  }
  for (const f of secrets) rmSync(join(worktree, f), { force: true });
  return secrets.length;
}

const IDENTITY = ["-c", "user.name=Furwatch Harness", "-c", "user.email=harness@localhost"];

/** Commits every change in the worktree (agents cannot run git themselves). Returns the SHA or null. */
export async function commitAll(worktree: string, message: string): Promise<string | null> {
  await git(worktree, ["add", "-A"]);
  const { stdout } = await git(worktree, ["status", "--porcelain"]);
  if (!stdout.trim()) return null;
  await git(worktree, [...IDENTITY, "commit", "-q", "--no-verify", "-m", message]);
  const head = await git(worktree, ["rev-parse", "HEAD"]);
  return head.stdout.trim();
}

/** Changed files and patch between two commits, with secret paths withheld. */
export async function diffBetween(
  repo: string,
  base: string,
  head: string,
  isSecret: (rel: string) => boolean,
): Promise<{ files: string[]; withheld: string[]; patch: string }> {
  const { stdout } = await git(repo, ["diff", "--name-only", `${base}..${head}`]);
  const changed = stdout.split(/\r?\n/).filter(Boolean);
  const withheld = changed.filter(isSecret);
  const files = changed.filter((f) => !isSecret(f));
  let patch = "";
  if (files.length) {
    const r = await git(repo, ["diff", `${base}..${head}`, "--", ...files]);
    patch = r.stdout.length > 400_000 ? `${r.stdout.slice(0, 400_000)}\n… (truncated)` : r.stdout;
  }
  return { files, withheld, patch };
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
  try {
    await git(repo, ["worktree", "remove", "--force", path], 120_000);
  } catch {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
  await git(repo, ["worktree", "prune"]).catch(() => undefined);
}
