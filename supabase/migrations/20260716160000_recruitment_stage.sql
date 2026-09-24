-- Ручная CRM-категория набора для лидов (education_journeys.recruitment_stage):
--   • 'interested'  (מתעניינת)  — по умолчанию для новых лидов;
--   • 'in_process'  (בתהליך)    — рекрутёр переводит вручную.
-- Это лёгкий статус, не связанный с конвертацией в «קבלה» (HandoffButton).
-- Идемпотентно (можно перезапускать).

ALTER TABLE education_journeys
  ADD COLUMN IF NOT EXISTS recruitment_stage TEXT NOT NULL DEFAULT 'interested'
  CHECK (recruitment_stage IN ('interested', 'in_process'));
