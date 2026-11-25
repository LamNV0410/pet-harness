-- M2: command runs, generic approvals, verdict cache.
CREATE TABLE command_runs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  command_id    TEXT NOT NULL,
  argv          TEXT NOT NULL,
  base_ref      TEXT NOT NULL,
  sha           TEXT,
  state         TEXT NOT NULL,
  exit_code     INTEGER,
  summary       TEXT,
  duration_ms   INTEGER,
  fetch         INTEGER NOT NULL,
  keep_worktree INTEGER NOT NULL,
  worktree      TEXT,
  approval_id   TEXT,
  cached_from   TEXT,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX command_runs_project ON command_runs (project_id, created_at);

CREATE TABLE approvals (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  detail       TEXT NOT NULL,
  effects      TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  state        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  decided_at   TEXT
);

CREATE TABLE verdicts (
  project_id TEXT NOT NULL,
  sha        TEXT NOT NULL,
  command_id TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  state      TEXT NOT NULL,
  summary    TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, sha, command_id)
);
