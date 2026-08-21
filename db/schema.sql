CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('BRANCH', 'AUTHORIZED', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS letters (
  id UUID PRIMARY KEY,
  branch VARCHAR(160) NOT NULL,
  customer_name VARCHAR(200) NOT NULL,
  title VARCHAR(160),
  letter_scope VARCHAR(120) NOT NULL,
  letter_license VARCHAR(80),
  tender_type VARCHAR(120) NOT NULL,
  recipient VARCHAR(200) NOT NULL,
  tender_name VARCHAR(240) NOT NULL,
  authority_name VARCHAR(160),
  authority_phone VARCHAR(50),
  authority_email VARCHAR(180),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  amount NUMERIC(16, 2) NOT NULL CHECK (amount >= 0),
  issue_date DATE NOT NULL,
  expiry_date DATE,
  reference_no VARCHAR(80),
  project_no VARCHAR(120),
  address TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS letters_created_by_index ON letters(created_by);
CREATE INDEX IF NOT EXISTS letters_status_index ON letters(status);
