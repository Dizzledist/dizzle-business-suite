CREATE TABLE reporting_preferences (
  organization_id TEXT NOT NULL, employee_id TEXT NOT NULL,
  dashboard TEXT NOT NULL CHECK(dashboard IN ('owner','admin','sales_manager')),
  include_shopify INTEGER NOT NULL CHECK(include_shopify IN (0,1)),
  PRIMARY KEY(organization_id,employee_id,dashboard)
) STRICT;
PRAGMA user_version=1;
