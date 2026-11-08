ALTER TABLE reporting_invoices ADD COLUMN invoice_date TEXT;
ALTER TABLE reporting_invoices ADD COLUMN payment_made TEXT;
ALTER TABLE reporting_invoices ADD COLUMN source_total TEXT;
ALTER TABLE reporting_invoices ADD COLUMN line_state TEXT NOT NULL DEFAULT 'unavailable'
  CHECK (line_state IN ('unavailable','invalid','reconciled','difference'));
ALTER TABLE reporting_invoices ADD COLUMN subtotal_difference TEXT;
ALTER TABLE reporting_invoices ADD COLUMN invoice_discount TEXT;
ALTER TABLE reporting_invoices ADD COLUMN invoice_adjustment TEXT;
ALTER TABLE reporting_invoices ADD COLUMN shipping_charge TEXT;
ALTER TABLE reporting_invoices ADD COLUMN recognized_line_revision TEXT;
ALTER TABLE reporting_invoices ADD COLUMN recognized_invoice_discount TEXT;
ALTER TABLE reporting_invoices ADD COLUMN recognized_customer_id TEXT;
ALTER TABLE reporting_invoices ADD COLUMN recognized_customer_name TEXT;

CREATE TABLE reporting_invoice_lines (
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (snapshot IN ('current','recognized')),
  position INTEGER NOT NULL,
  line_id TEXT,
  product_id TEXT,
  sku TEXT,
  line_data TEXT NOT NULL CHECK (json_valid(line_data)),
  source_revision TEXT,
  synchronized_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, invoice_id, snapshot, position),
  UNIQUE (organization_id, invoice_id, snapshot, line_id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES reporting_invoices (organization_id, invoice_id)
) STRICT;
