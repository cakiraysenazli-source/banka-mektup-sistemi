

-- ==========================================================
-- DATABASE TABLES AND INDEXES
-- ==========================================================
-- Kullanıcıları ve mektupları veritabanında saklamak için
-- gerekli tabloları oluşturur.
-- Users tablosu kullanıcı bilgilerini ve rollerini,
-- letters tablosu ise mektup bilgilerini ve durumlarını tutar.
-- Ayrıca mektupların hangi kullanıcı tarafından oluşturulduğunu
-- users tablosuna bağlar ve sorguları hızlandırmak için indexler oluşturur.
-- Kısaca verilerin tutulacağı yapıyı tanımlar.


CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role VARCHAR(20) NOT NULL
    CHECK (
      role IN (
        'BRANCH',
        'AUTHORIZED',
        'ADMIN'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS letters (
  id UUID PRIMARY KEY,

  branch VARCHAR(160),
  customer_name VARCHAR(200),
  title VARCHAR(160),

  letter_scope VARCHAR(120),
  letter_license VARCHAR(80),

  tender_type VARCHAR(120),
  recipient VARCHAR(200),
  tender_name VARCHAR(240),

  authority_name VARCHAR(160),
  authority_phone VARCHAR(50),
  authority_email VARCHAR(180),

  currency VARCHAR(10)
    DEFAULT 'TRY',

  amount NUMERIC(16, 2)
    CHECK (
      amount IS NULL OR amount >= 0
    ),

  issue_date DATE,
  expiry_date DATE,

  reference_no VARCHAR(80),
  project_no VARCHAR(120),

  address TEXT,
  notes TEXT,

  status VARCHAR(20) NOT NULL
    DEFAULT 'DRAFT'
    CHECK (
      status IN (
        'DRAFT',
        'PENDING',
        'APPROVED',
        'REJECTED'
      )
    ),

  rejection_reason TEXT,

  created_by UUID NOT NULL
    REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  letters_created_by_index
ON letters(created_by);

CREATE INDEX IF NOT EXISTS
  letters_status_index
ON letters(status);