-- ═════════════════════════════════════════════════════════════════════
-- Документы (Documents / מסמכים) — MVP: пер-студенческий реестр документов
-- с контролем срока годности.
--
-- Одна НОВАЯ чистая таблица:
--   • document_records — документы студента: тип (id_card/passport/certificate/
--     medical/financial/contract/visa/other), название, даты выдачи и окончания,
--     ссылка на файл, статус active/archived, заметки.
--
-- ⚠️ ВНИМАНИЕ — LEGACY. В боевой БД от старого дизайна остались таблицы
--   document_types, document_categories, person_documents, journey_documents
--   (шаблоны/категории документов). Этот модуль их НЕ использует и НЕ трогает —
--   он владеет отдельной чистой таблицей document_records. Legacy-таблицы
--   оставлены как есть, чтобы не сломать старые данные/ссылки.
--
-- Записи висят на education_journeys(id) студента (journey_id), НЕ на persons —
-- тот же приём анкоринга, что в остальных учебных модулях (food/doctor/dormitory).
--
-- Расчёты срока годности (expired / expiring_soon) и агрегаты — чистая логика в
-- lib/documents/expiry.ts (покрыта vitest), НЕ в БД.
--
-- Права: НОВЫХ привилегий не изобретаем — модуль 'documents' с привилегиями
-- 'view' / 'manage'. Каталог module_privileges досеивается идемпотентно (на
-- случай неполного сида 002 на боевой БД) и выдаётся системным ролям scope='all'
-- — тот же паттерн, что 20260707150000_doctor.sql (иначе НИ ОДИН пользователь,
-- включая superadmin, не проходит requireDocumentsPrivilege).
-- ВНИМАНИЕ: сид 002 УЖЕ содержит другие привилегии 'documents'
-- (view/create/manage_templates) — их НЕ трогаем, только ДОБАВЛЯЕМ 'manage'
-- (view уже есть → ON CONFLICT DO NOTHING) и выдаём системным ролям ТОЛЬКО
-- view/manage.
--
-- Страницы /dashboard/documents защищены middleware (PROTECTED_MODULES уже
-- содержит 'documents').
--
-- Идемпотентно: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS + CREATE;
-- set_updated_at() определяется здесь же через CREATE OR REPLACE.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 0. set_updated_at() — на случай если функции ещё нет в целевой БД
--    (идентична версии проекта)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$;


-- ─────────────────────────────────────────────
-- 1. DOCUMENT_RECORDS (реестр документов студента)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES education_journeys(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL CHECK (doc_type IN (
                  'id_card', 'passport', 'certificate', 'medical',
                  'financial', 'contract', 'visa', 'other'
                )) DEFAULT 'other',
  title         TEXT NOT NULL,
  issued_date   DATE,
  expiry_date   DATE,
  file_url      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_records_journey  ON document_records(journey_id);
CREATE INDEX IF NOT EXISTS idx_document_records_doc_type ON document_records(doc_type);
-- Частичный индекс: быстрый worklist истекающих документов (активные с датой).
CREATE INDEX IF NOT EXISTS idx_document_records_active_expiry
  ON document_records(expiry_date) WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_document_records ON document_records;
CREATE TRIGGER set_updated_at_document_records
  BEFORE UPDATE ON document_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────
-- 3. Права модуля 'documents' — issue #1 grant block.
--    Каталог module_privileges ('documents','view'/'manage') досеивается
--    идемпотентно, затем выдаётся системным ролям scope='all'. Паттерн
--    идентичен 20260707150000_doctor.sql.
--    NB: сид 002 УЖЕ завёл привилегии 'documents' view/create/manage_templates
--    (sort_order 1/2/3) — ON CONFLICT DO NOTHING их сохраняет, мы лишь добавляем
--    'manage' (свободный sort_order 4). Системным ролям выдаём ТОЛЬКО view/manage.
-- ─────────────────────────────────────────────

INSERT INTO module_privileges (module, privilege_code, privilege_name, sort_order) VALUES
  ('documents', 'view',   'Просмотр',   1),
  ('documents', 'manage', 'Управление', 4)
ON CONFLICT (module, privilege_code) DO NOTHING;

DO $$
DECLARE
  rcode TEXT;
  pcode TEXT;
  rid   UUID;
BEGIN
  FOREACH rcode IN ARRAY ARRAY['superadmin', 'tech_admin', 'campus_president']
  LOOP
    SELECT id INTO rid FROM roles WHERE code = rcode;
    IF rid IS NULL THEN CONTINUE; END IF;

    -- Только view/manage: если сид 002 завёл иные привилегии 'documents'
    -- (create/manage_templates), их НЕ выдаём. См. спецификацию модуля.
    FOREACH pcode IN ARRAY ARRAY['view', 'manage']
    LOOP
      INSERT INTO role_privileges (role_id, module, privilege_code, scope)
      VALUES (rid, 'documents', pcode, 'all')
      ON CONFLICT (role_id, module, privilege_code) DO UPDATE SET scope = 'all';
    END LOOP;
  END LOOP;
END $$;
