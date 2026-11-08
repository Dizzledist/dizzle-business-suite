CREATE TABLE sales_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  department TEXT NOT NULL,
  team_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('sales_rep', 'sales_manager', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  UNIQUE (issuer, subject),
  UNIQUE (organization_id, email),
  UNIQUE (organization_id, id)
) STRICT;

CREATE INDEX sales_users_by_team ON sales_users (organization_id, team_id, status, id);

CREATE TABLE sales_user_zoho_mappings (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  zoho_salesperson_id TEXT NOT NULL,
  verification_reference TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id),
  UNIQUE (organization_id, zoho_salesperson_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES sales_users (organization_id, id),
  FOREIGN KEY (organization_id, verified_by) REFERENCES sales_users (organization_id, id)
) STRICT;

CREATE TABLE sales_sessions (
  token_digest TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sales_users (id),
  issued_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sales_sessions_by_user ON sales_sessions (user_id);
CREATE INDEX sales_sessions_by_expiry ON sales_sessions (expires_at);

CREATE TABLE sales_identity_audit (
  id INTEGER PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_id TEXT REFERENCES sales_users (id),
  target_id TEXT NOT NULL REFERENCES sales_users (id),
  action TEXT NOT NULL,
  at INTEGER NOT NULL,
  change_details TEXT
) STRICT;

CREATE INDEX sales_audit_by_organization ON sales_identity_audit (organization_id, id DESC);
