-- New isolated publishing queue, version 1. Review before provisioning a hosted database.
CREATE TABLE IF NOT EXISTS publishing_schema(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO publishing_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS publishing_jobs(
        id TEXT PRIMARY KEY, content_id TEXT NOT NULL, approval TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('scheduled','publishing','published','failed','needs_review','canceled')),
        due TEXT NOT NULL, payload TEXT NOT NULL, image BLOB NOT NULL, created TEXT NOT NULL,
        started TEXT, lease TEXT, lease_until INTEGER, checkpoint TEXT NOT NULL DEFAULT '{}',
        provider_id TEXT, url TEXT, error TEXT, published TEXT, posted_by TEXT, manual INTEGER NOT NULL DEFAULT 0,
        UNIQUE(content_id,approval));
      CREATE TABLE IF NOT EXISTS publishing_events(id INTEGER PRIMARY KEY, job_id TEXT, at TEXT, actor TEXT, action TEXT);
      CREATE INDEX IF NOT EXISTS publishing_due ON publishing_jobs(state,due);
