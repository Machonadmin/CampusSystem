-- ═════════════════════════════════════════════════════════════════════
-- Фиксация DDL для stage_finals.closes_process / process_finish_reason.
--
-- ПРОБЛЕМА: движок (complete_stage, close_process_early, admission_student_
-- conversion) и все сиды процессов (admission, acceptance) читают/пишут эти
-- две колонки, они объявлены в types/database.ts, НО ни одна миграция их не
-- создаёт — в 20260529130000_recreate_workflow_engine.sql таблица stage_finals
-- объявлена без них (см. строки 71-79). На боевой БД колонки были добавлены
-- вручную, поэтому там всё работает; но чистый прогон миграций с нуля падал
-- бы на сидах admission/acceptance.
--
-- Эта миграция фиксирует колонки в версионируемом SQL. Идемпотентна:
-- ADD COLUMN IF NOT EXISTS — на боевой БД (колонки уже есть) это no-op,
-- на чистой БД добавляет их до сидов процессов.
--
--   • closes_process        — финал закрывает весь процесс и отменяет
--                             оставшиеся подэтапы/задачи (ветка A в
--                             complete_stage).
--   • process_finish_reason — какой process_instances.finish_reason
--                             проставить при закрытии ('admitted',
--                             'rejected', 'converted', 'postponed', …).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS closes_process BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE stage_finals
  ADD COLUMN IF NOT EXISTS process_finish_reason TEXT;

COMMENT ON COLUMN stage_finals.closes_process IS
  'Финал закрывает весь процесс: оставшиеся подэтапы и задачи отменяются';
COMMENT ON COLUMN stage_finals.process_finish_reason IS
  'process_instances.finish_reason при закрытии процесса этим финалом';
