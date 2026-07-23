-- ═════════════════════════════════════════════════════════════════════
-- Расширение enum person_education_status значениями учебного цикла.
--
-- До этой миграции enum содержал только:
--   lead | applicant | student | alumni
-- а TS-тип JourneyStatus (types/database.ts) уже перечислял
--   lead | applicant | student | graduated | expelled | lost | on_leave
-- — то есть код был написан «на вырост», но БД-enum не был расширен, и
-- любая запись education_status='on_leave'/'graduated'/'expelled' падала
-- с ошибкой инварианта enum (22P02).
--
-- Эта миграция приводит БД в соответствие с TS-типом: добавляет значения
-- жизненного цикла студента (учёба → отпуск/выпуск/отчисление).
--
-- ВАЖНО:
--   * Применять ВРУЧНУЮ через Supabase Dashboard → SQL Editor (как и все
--     миграции проекта — см. docs/conventions.md).
--   * ALTER TYPE ... ADD VALUE в PostgreSQL нельзя ИСПОЛЬЗОВАТЬ в той же
--     транзакции, где значение добавлено. Здесь мы только ДОБАВЛЯЕМ (не
--     используем) — это безопасно в одном скрипте. RPC, который использует
--     новые значения (20260705120100_*), применяется отдельным запуском
--     ПОСЛЕ этого файла.
--   * IF NOT EXISTS делает миграцию идемпотентной (PostgreSQL 12+).
--
-- Значение 'alumni' оставлено как есть (историческое, не используется в
-- новом коде — выпуск помечается как 'graduated').
-- ═════════════════════════════════════════════════════════════════════

ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'on_leave';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'graduated';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'expelled';
ALTER TYPE person_education_status ADD VALUE IF NOT EXISTS 'lost';
