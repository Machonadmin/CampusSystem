-- Migration: document_storage
-- Real file uploads for the Documents module, backed by Supabase Storage.
--
-- Adds a PRIVATE storage bucket `documents` and storage-metadata columns on
-- `document_records`. The server uploads / signs URLs with the service-role key
-- (bypasses storage RLS), so no storage policies are defined here — the app's
-- own documents permission layer is the access guard. Idempotent.

-- 1. Private bucket (never public — access only via server-signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage metadata columns (nullable — existing external-link rows keep file_url)
ALTER TABLE document_records ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE document_records ADD COLUMN IF NOT EXISTS file_name   TEXT;
ALTER TABLE document_records ADD COLUMN IF NOT EXISTS mime_type   TEXT;
ALTER TABLE document_records ADD COLUMN IF NOT EXISTS size_bytes  BIGINT;
