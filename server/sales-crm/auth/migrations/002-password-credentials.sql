ALTER TABLE sales_sessions ADD COLUMN password_authenticated INTEGER NOT NULL DEFAULT 0
  CHECK (password_authenticated IN (0, 1));

CREATE TABLE sales_password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES sales_users (id),
  login_email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  changed_at INTEGER
) STRICT;

CREATE TABLE sales_password_actions (
  user_id TEXT PRIMARY KEY REFERENCES sales_password_credentials (user_id),
  token_digest TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'reset')),
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sales_password_reset_requests (
  user_id TEXT PRIMARY KEY REFERENCES sales_password_credentials (user_id),
  requested_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sales_password_rate_limits (
  attempt_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sales_password_rate_expiry ON sales_password_rate_limits (expires_at);
