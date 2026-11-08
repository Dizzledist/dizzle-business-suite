ALTER TABLE sales_sessions ADD COLUMN google_policy TEXT;

CREATE TABLE sales_google_enrollments (
  user_id TEXT PRIMARY KEY REFERENCES sales_users (id),
  secret_digest TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
) STRICT;
