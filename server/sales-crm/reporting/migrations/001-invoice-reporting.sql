CREATE TABLE reporting_salespeople (
  organization_id TEXT NOT NULL,
  source_salesperson_id TEXT NOT NULL,
  crm_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (organization_id, source_salesperson_id)
) STRICT;

CREATE TABLE reporting_invoices (
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  source_salesperson_id TEXT,
  credited_user_id TEXT,
  credited_name TEXT,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  subtotal INTEGER NOT NULL,
  recognized_subtotal INTEGER,
  created_at TEXT,
  first_email_at INTEGER,
  evidence_source TEXT,
  evidence_id TEXT,
  evidence_salesperson_id TEXT,
  verification TEXT NOT NULL CHECK (verification IN ('verified','pending','unavailable','conflicting')),
  payment TEXT NOT NULL CHECK (payment IN ('unpaid','partial','paid','review')),
  open_balance INTEGER NOT NULL,
  invoice_status TEXT NOT NULL,
  review_reason TEXT,
  source_modified_at INTEGER,
  last_sync_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, invoice_id),
  CHECK (verification <> 'verified' OR
    (first_email_at IS NOT NULL AND recognized_subtotal IS NOT NULL AND evidence_source IS NOT NULL AND evidence_id IS NOT NULL))
) STRICT;

CREATE INDEX reporting_by_recognition
  ON reporting_invoices (organization_id, first_email_at, invoice_id)
  WHERE verification = 'verified' AND review_reason IS NULL;
CREATE INDEX reporting_by_rep_and_recognition
  ON reporting_invoices (organization_id, credited_user_id, first_email_at, invoice_id)
  WHERE verification = 'verified' AND review_reason IS NULL;

CREATE TABLE reporting_sync_state (
  organization_id TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1 CHECK (next_page > 0),
  initial_done INTEGER NOT NULL DEFAULT 0 CHECK (initial_done IN (0, 1)),
  lease TEXT,
  lease_until INTEGER,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','partial','failed','complete')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER,
  last_error TEXT
) STRICT;

CREATE TABLE reporting_sync_queue (
  organization_id TEXT NOT NULL REFERENCES reporting_sync_state (organization_id),
  invoice_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  error_category TEXT,
  PRIMARY KEY (organization_id, invoice_id)
) STRICT;
CREATE INDEX reporting_sync_due ON reporting_sync_queue (organization_id, next_attempt_at, invoice_id);
