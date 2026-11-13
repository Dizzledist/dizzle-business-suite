ALTER TABLE reporting_invoices ADD COLUMN send_verification TEXT NOT NULL DEFAULT 'pending'
  CHECK (send_verification IN ('verified','pending','unavailable','conflicting'));
ALTER TABLE reporting_invoices ADD COLUMN amount_verification TEXT NOT NULL DEFAULT 'pending'
  CHECK (amount_verification IN ('verified','pending','unavailable','conflicting'));
ALTER TABLE reporting_invoices ADD COLUMN send_evidence TEXT CHECK (send_evidence IS NULL OR json_valid(send_evidence));
ALTER TABLE reporting_invoices ADD COLUMN amount_evidence TEXT CHECK (amount_evidence IS NULL OR json_valid(amount_evidence));
ALTER TABLE reporting_invoices ADD COLUMN original_snapshot TEXT CHECK (original_snapshot IS NULL OR json_valid(original_snapshot));
ALTER TABLE reporting_invoices ADD COLUMN current_snapshot TEXT CHECK (current_snapshot IS NULL OR json_valid(current_snapshot));
UPDATE reporting_invoices SET send_verification = verification, amount_verification = verification;

CREATE TABLE reporting_evidence_reviews (
  id INTEGER PRIMARY KEY,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  review_data TEXT NOT NULL CHECK (json_valid(review_data)),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES reporting_invoices (organization_id, invoice_id)
) STRICT;
CREATE INDEX reporting_evidence_by_invoice
  ON reporting_evidence_reviews (organization_id, invoice_id, id);
