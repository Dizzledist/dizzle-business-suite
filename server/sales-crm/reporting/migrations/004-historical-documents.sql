CREATE TABLE reporting_documents (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source='synthetic'),
 source_type TEXT NOT NULL,
 artifact_id TEXT NOT NULL,
 content BLOB NOT NULL,
 digest TEXT NOT NULL,
 manifest TEXT NOT NULL CHECK(json_valid(manifest)),
 manifest_digest TEXT NOT NULL,
 provenance TEXT NOT NULL,
 registered_by TEXT NOT NULL,
 registered_at INTEGER NOT NULL,
 UNIQUE(organization_id,invoice_id,digest,source_type),
 FOREIGN KEY(organization_id,invoice_id) REFERENCES reporting_invoices(organization_id,invoice_id)
) STRICT;
CREATE TABLE reporting_document_reviews (
 id INTEGER PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES reporting_documents(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('send','amount')),
 verification TEXT NOT NULL CHECK(verification IN ('verified','pending','unavailable','conflicting')),
 reviewer_id TEXT NOT NULL,
 reviewed_at INTEGER NOT NULL,
 review_data TEXT NOT NULL CHECK(json_valid(review_data))
) STRICT;
CREATE INDEX reporting_reviews_by_document ON reporting_document_reviews(document_id,id);
