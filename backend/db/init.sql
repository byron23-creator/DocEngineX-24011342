CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE doc_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE doc_template AS ENUM ('invoice', 'report', 'certificate');

CREATE TABLE IF NOT EXISTS public_documents (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  status        doc_status    NOT NULL DEFAULT 'queued',
  template_type doc_template  NOT NULL,
  file_url      VARCHAR(2048),
  error_reason  TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_public_documents_status ON public_documents(status);
CREATE INDEX idx_public_documents_created_at ON public_documents(created_at DESC);
