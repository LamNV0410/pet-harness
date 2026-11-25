-- M3–M5: work items, artifacts, tasks, agent runs and their activity.
CREATE TABLE work_items (
  id          TEXT PRIMARY KEY,
  seq         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  stage       TEXT NOT NULL,
  status      TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE artifacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  agent_run_id TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  owner        TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  details      TEXT NOT NULL,
  status       TEXT NOT NULL,
  branch       TEXT,
  worktree     TEXT,
  base_sha     TEXT,
  commit_sha   TEXT
);

CREATE TABLE agent_runs (
  id            TEXT PRIMARY KEY,
  work_item_id  TEXT NOT NULL,
  task_id       TEXT,
  role          TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  state         TEXT NOT NULL,
  session_id    TEXT,
  turns         INTEGER,
  cost_usd      REAL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  error         TEXT,
  output        TEXT,
  roots         TEXT NOT NULL,
  write_root    TEXT,
  created_at    TEXT NOT NULL,
  finished_at   TEXT
);

CREATE TABLE agent_activity (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_run_id TEXT NOT NULL,
  ts           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  text         TEXT NOT NULL
);
CREATE INDEX agent_activity_run ON agent_activity (agent_run_id, id);

ALTER TABLE command_runs ADD COLUMN work_item_id TEXT;
