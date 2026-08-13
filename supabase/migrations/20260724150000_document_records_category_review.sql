-- ═════════════════════════════════════════════════════════════════════
-- Категории и статус проверки для живого модуля документов (document_records).
-- Stage 5 — сближение с бизнес-процессом v2 (документы по категориям +
-- рабочий статус проверки), АДДИТИВНО к работающему модулю-реестру файлов.
--
--   • category      — категория документа по спецификации:
--       general (כללי) / jewish (יהדות) / academic (לימודים) /
--       dormitory (פנימייה) / other (נוסף). doc_type остаётся ВИДОМ документа
--       (паспорт/справка/…), category — это ГРУППИРОВКА.
--   • review_status — рабочий статус проверки загруженного документа:
--       received (התקבל, по умолчанию) / checked (נבדק) / rejected (נדחה).
--       Отдельно от status (active/archived — жизненный цикл записи).
--       «Не запрошен/запрошен» к реестру ФАЙЛОВ не применимы — запись
--       появляется только когда файл уже получен.
--   • reviewed_by / reviewed_at — кто и когда проверил.
--
-- Deploy-safe: ADD COLUMN IF NOT EXISTS. До применения код читает через '*'
-- (колонок нет → просто не приходят) и пишет их отдельным best-effort update.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE document_records
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'jewish', 'academic', 'dormitory', 'other')),
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'received'
    CHECK (review_status IN ('received', 'checked', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES persons(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN document_records.category IS
  'Категория документа: general/jewish/academic/dormitory/other (группировка)';
COMMENT ON COLUMN document_records.review_status IS
  'Статус проверки: received/checked/rejected (отдельно от status active/archived)';
