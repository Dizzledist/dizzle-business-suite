-- Isolated pilot-control store v1. A single immutable slot; no queue/business migration.
CREATE TABLE pilot_control (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  job_id TEXT NOT NULL, account_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  selected_by TEXT NOT NULL, selected_at TEXT NOT NULL,
  consumed_at TEXT, reservation TEXT
);
PRAGMA user_version=1;
