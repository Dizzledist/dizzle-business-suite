CREATE TABLE sales_zoho_bindings (
  tenant_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL CHECK (organization_id = '821729823'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (state IN ('approved','revoked')),
  approval_reference TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (tenant_id <> organization_id AND tenant_id <> 'demo-o1'),
  FOREIGN KEY (tenant_id, approved_by) REFERENCES sales_users (organization_id, id)
) STRICT;
CREATE UNIQUE INDEX sales_one_zoho_tenant ON sales_zoho_bindings (organization_id) WHERE state = 'approved';
