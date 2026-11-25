// Runs git from an argv array (no shell), with a timeout and bounded output (04 §1).
import { execFile } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: readonly string[], timeoutMs = 15_000): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["--no-pager", "-c", "core.quotepath=off", "-c", "color.ui=false", ...args],
      { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        // git grep exits 1 when nothing matches: that is not an error.
        if (err && !(args[0] === "grep" && (err as { code?: number }).code === 1)) {
          reject(new Error(`git ${args[0]} failed: ${stderr.trim() || err.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/** A ref the tools accept: branch, tag, sha, HEAD~n. Never starts with "-" (no option injection). */
export const SAFE_REF = /^(?!-)[A-Za-z0-9._/~^@-]{1,200}$/;
