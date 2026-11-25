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

export async function removeWorktree(repo: string, path: string): Promise<void> {
  try {
    await git(repo, ["worktree", "remove", "--force", path], 120_000);
  } catch {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
  await git(repo, ["worktree", "prune"]).catch(() => undefined);
}
