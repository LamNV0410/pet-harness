// One-line verdict summaries from command output (dotnet build/test, Angular/Karma, npm).

export function summarize(
  commandId: string,
  lines: readonly string[],
  exitCode: number | null,
): string {
  const text = lines.join("\n");

  // dotnet test: "Passed!  - Failed: 0, Passed: 153, Skipped: 0, Total: 153, Duration: ..."
  const dt = [
    ...text.matchAll(
      /(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/g,
    ),
  ];
  if (dt.length) {
    const sum = dt.reduce(
      (a, m) => ({
        f: a.f + Number(m[1]),
        p: a.p + Number(m[2]),
        s: a.s + Number(m[3]),
        t: a.t + Number(m[4]),
      }),
      { f: 0, p: 0, s: 0, t: 0 },
    );
    return `tests: ${sum.p} passed, ${sum.f} failed, ${sum.s} skipped (${sum.t} total)`;
  }

  // dotnet build: "Build succeeded." + "N Warning(s)" / "N Error(s)"
  const warn = /(\d+)\s+Warning\(s\)/.exec(text);
  const err = /(\d+)\s+Error\(s\)/.exec(text);
  if (/Build succeeded\./.test(text) || /Build FAILED\./.test(text)) {
    return `build ${/Build succeeded\./.test(text) ? "succeeded" : "FAILED"} · ${err?.[1] ?? "?"} errors · ${warn?.[1] ?? "?"} warnings`;
  }

  // Karma: "Executed 53 of 53 (2 FAILED)" / "TOTAL: 51 SUCCESS"
  const karma = [...text.matchAll(/Executed (\d+) of (\d+)(?: \((\d+) FAILED\))?/g)].pop();
  if (karma)
    return `tests: executed ${karma[1]} of ${karma[2]}${karma[3] ? `, ${karma[3]} failed` : ""}`;

  // npm install: "added 1234 packages ..."
  const added = /added (\d+) packages?/.exec(text);
  if (added) return `installed ${added[1]} packages`;

  // Angular build
  if (/Application bundle generation (complete|failed)/.test(text)) {
    return /complete/.test(text) ? "build succeeded" : "build failed";
  }
  const ngErr = (text.match(/\bERROR\b|error TS\d+/g) ?? []).length;
  if (ngErr && exitCode !== 0) return `${ngErr} errors`;

  const last = [...lines].reverse().find((l) => l.trim() && !l.startsWith("[harness]"));
  return `${commandId} exited ${exitCode ?? "?"}${last ? ` · ${last.trim().slice(0, 160)}` : ""}`;
}
