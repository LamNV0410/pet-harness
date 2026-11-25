-- WI-001 M1 schema (design.md §5.2). Only the tables M1 needs.
CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL,
  base_ref     TEXT NOT NULL,
  status       TEXT NOT NULL,
  reason       TEXT,
  secret_paths TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT NOT NULL,
  type           TEXT NOT NULL,
  actor          TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id   INTEGER,
  payload        TEXT NOT NULL
);

CREATE TABLE tool_calls (
  id             TEXT PRIMARY KEY,
  ts             TEXT NOT NULL,
  tool           TEXT NOT NULL,
  role           TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  args_redacted  TEXT NOT NULL,
  decision       TEXT NOT NULL,
  rule_id        TEXT NOT NULL,
  status         TEXT NOT NULL,
  duration_ms    INTEGER,
  output_preview TEXT,
  error          TEXT
);
