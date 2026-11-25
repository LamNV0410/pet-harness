// Process supervisor: argv only (no shell), redacted line capture, timeout, Windows-safe tree kill.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface Spawned {
  child: ChildProcess;
  done: Promise<{ exitCode: number | null; timedOut: boolean; cancelled: boolean }>;
  cancel(): void;
}

export interface Toolchains {
  /** Directory of the system Node (e.g. Node 20), used by toolchain "node-system". */
  systemNodeDir: string | null;
}

export function detectToolchains(env: NodeJS.ProcessEnv = process.env): Toolchains {
  const candidates = [
    env.HARNESS_SYSTEM_NODE_DIR,
    "C:\\Program Files\\nodejs",
    "/usr/local/bin",
    "/usr/bin",
  ].filter((d): d is string => !!d);
  const exe = process.platform === "win32" ? "node.exe" : "node";
  const dir = candidates.find((d) => existsSync(join(d, exe))) ?? null;
  return { systemNodeDir: dir };
}

/** Resolves argv[0] for a toolchain. npm/npx become `node <cli.js>` so no shell (.cmd) is needed. */
export function resolveArgv(
  argv: readonly string[],
  toolchain: "default" | "node-system",
  tc: Toolchains,
): { file: string; args: string[]; pathPrefix: string | null } {
  const [cmd, ...rest] = argv as [string, ...string[]];
  if (toolchain === "node-system") {
    if (!tc.systemNodeDir) throw new Error("system Node not found (set HARNESS_SYSTEM_NODE_DIR)");
    const node = join(tc.systemNodeDir, process.platform === "win32" ? "node.exe" : "node");
    const npmDir = join(tc.systemNodeDir, "node_modules", "npm", "bin");
    if (cmd === "node") return { file: node, args: rest, pathPrefix: tc.systemNodeDir };
    if (cmd === "npm")
      return {
        file: node,
        args: [join(npmDir, "npm-cli.js"), ...rest],
        pathPrefix: tc.systemNodeDir,
      };
    if (cmd === "npx")
      return {
        file: node,
        args: [join(npmDir, "npx-cli.js"), ...rest],
        pathPrefix: tc.systemNodeDir,
      };
  }
  return { file: cmd, args: rest, pathPrefix: null };
}

export function killTree(pid: number): void {
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

export function runProcess(opts: {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  pathPrefix: string | null;
  timeoutMs: number;
  onLine: (line: string, stream: "out" | "err") => void;
}): Spawned {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  if (opts.pathPrefix) {
    const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
    // Drop the Harness's own Node (fnm) from PATH so product tools use the declared toolchain.
    const parts = (env[key] ?? "")
      .split(delimiter)
      .filter((p) => !/fnm[\\/]node-versions/i.test(p));
    env[key] = [opts.pathPrefix, ...parts].join(delimiter);
  }
  const child = spawn(opts.file, opts.args, {
    cwd: opts.cwd,
    env,
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) killTree(child.pid);
  }, opts.timeoutMs);
  const pipe = (stream: NodeJS.ReadableStream | null, kind: "out" | "err") => {
    if (!stream) return;
    let buf = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) opts.onLine(l, kind);
    });
    stream.on("end", () => {
      if (buf) opts.onLine(buf, kind);
    });
  };
  pipe(child.stdout, "out");
  pipe(child.stderr, "err");
  const done = new Promise<{ exitCode: number | null; timedOut: boolean; cancelled: boolean }>(
    (resolve) => {
      child.on("error", (err) => {
        opts.onLine(`[harness] failed to start: ${err.message}`, "err");
        clearTimeout(timer);
        resolve({ exitCode: null, timedOut, cancelled });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, timedOut, cancelled });
      });
    },
  );
  return {
    child,
    done,
    cancel() {
      cancelled = true;
      if (child.pid) killTree(child.pid);
    },
  };
}
