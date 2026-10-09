-- ============================================================================
-- M16 (решение владельца 2026-10-08): статусов בירור יהדות ровно ТРИ:
--   verified  = «אושר»      (Approved / Подтверждено)
--   pending   = «בבדיקה»    (In review / На проверке) — пока в проверке статус можно менять
--   rejected  = «לא אושר»   (Not approved / Не подтверждено)
--
-- Упразднённые статусы переводятся так:
--   initial_checked → pending  (первичная проверка рава остаётся ДЕЙСТВИЕМ:
--                               кто/когда — в jewishness_initial_checked_by/at,
--                               в истории — source = 'initial_check')
--   needs_review    → pending
--   partial         → pending  (выбор: «частично подтверждено» = ещё в проверке)
--
-- Также удаляется настройка процесса «קבלה»: исход 'partial' («Подтверждено
-- частично») этапа 'jewishness' и переход по нему. Завершённые этапы с
-- final_code = 'partial' остаются в истории как есть (это текстовый код,
-- без внешнего ключа).
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- 1) Снимаем старые CHECK (в них 6 значений), чтобы перевести данные.
ALTER TABLE education_journeys
  DROP CONSTRAINT IF EXISTS education_journeys_jewishness_status_check;
ALTER TABLE jewishness_status_history
  DROP CONSTRAINT IF EXISTS jewishness_status_history_status_check;

-- 2) Текущие статусы студенток.
UPDATE education_journeys
   SET jewishness_status = 'pending'
 WHERE jewishness_status IN ('initial_checked', 'needs_review', 'partial');

-- 'partial' раньше считался решением и заполнял verified_by/at; теперь это
-- «בבדיקה» — решения ещё нет, поэтому эти поля у статуса pending очищаем
-- (так же делает код при установке pending). initial_checked_by/at не трогаем.
UPDATE education_journeys
   SET jewishness_verified_by = NULL,
       jewishness_verified_at = NULL
 WHERE jewishness_status = 'pending'
   AND (jewishness_verified_by IS NOT NULL OR jewishness_verified_at IS NOT NULL);

-- 3) История: первичная проверка → pending + source 'initial_check';
--    остальные упразднённые → pending (источник сохраняется).
UPDATE jewishness_status_history
   SET status = 'pending',
       source = 'initial_check'
 WHERE status = 'initial_checked';

UPDATE jewishness_status_history
   SET status = 'pending'
 WHERE status IN ('needs_review', 'partial');

-- 4) Новые CHECK — ровно три значения.
ALTER TABLE education_journeys
  ADD CONSTRAINT education_journeys_jewishness_status_check
  CHECK (jewishness_status IN ('pending', 'verified', 'rejected'));

ALTER TABLE jewishness_status_history
  ADD CONSTRAINT jewishness_status_history_status_check
  CHECK (status IN ('pending', 'verified', 'rejected'));

-- 5) Удаляем исход 'partial' этапа 'jewishness' и переходы по нему
--    (во всех версиях процесса приёма, где есть такой этап).
DELETE FROM stage_transitions t
 USING stage_templates st
 WHERE t.from_stage_template_id = st.id
   AND st.code = 'jewishness'
   AND t.trigger_final_code = 'partial';

DELETE FROM stage_finals f
 USING stage_templates st
 WHERE f.stage_template_id = st.id
   AND st.code = 'jewishness'
   AND f.code = 'partial';

COMMIT;
