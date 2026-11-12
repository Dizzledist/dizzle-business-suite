-- New shared identity schema. Explicit operator migration only; never startup schema push.
CREATE TABLE employees (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, issuer TEXT NOT NULL, subject TEXT NOT NULL,
  hosted_domain TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  UNIQUE(issuer,subject), UNIQUE(organization_id,id)
) STRICT;
CREATE TABLE employee_grants (
  employee_id TEXT NOT NULL REFERENCES employees(id), grant_name TEXT NOT NULL,
  PRIMARY KEY(employee_id,grant_name)
) STRICT;
CREATE TABLE sessions (
  token_digest TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
  issued_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE oidc_flows (
  state_digest TEXT PRIMARY KEY, binding_digest TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE pending_principals (
  issuer TEXT NOT NULL, subject TEXT NOT NULL, hosted_domain TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, seen_at INTEGER NOT NULL,
  PRIMARY KEY(issuer,subject)
) STRICT;
CREATE TABLE workloads (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, token_digest TEXT UNIQUE NOT NULL,
  permission TEXT NOT NULL CHECK(permission='publishing:authorize'), expires_at INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1))
) STRICT;
CREATE TABLE identity_audit (id INTEGER PRIMARY KEY, organization_id TEXT, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL) STRICT;
PRAGMA user_version=1;
