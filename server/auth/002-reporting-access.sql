-- Explicit shared identity migration. Existing sessions, employees and grants remain unchanged.
-- No implicit role/store assignment; existing employees receive no retail access.
CREATE TABLE employee_roles (
  employee_id TEXT NOT NULL REFERENCES employees(id), role TEXT NOT NULL,
  PRIMARY KEY(employee_id,role)
) STRICT;
CREATE TABLE employee_retail_stores (
  employee_id TEXT NOT NULL REFERENCES employees(id), store_id TEXT NOT NULL,
  PRIMARY KEY(employee_id,store_id)
) STRICT;
PRAGMA user_version=2;
