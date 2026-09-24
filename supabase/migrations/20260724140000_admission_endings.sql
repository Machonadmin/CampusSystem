-- ═════════════════════════════════════════════════════════════════════
-- Дополнительные финалы процесса приёма (acceptance) — Stage 3.
-- Аддитивно и безопасно: НЕ меняет структуру этапов (по решению владельца
-- общежитие оставляем как есть — один этап, без 3 последовательных интервью).
-- Только добавляем исходы, которых требует бизнес-процесс v2:
--
--   • academic       + 'exam_required'    (נדרשים מבחני קבלה) — не закрывает,
--       ведёт в final_approval (after_all), как и остальные академ-финалы.
--   • final_approval + 'external_studies' (לימודים חיצוניים) — закрывает процесс,
--       reason='external_studies'. НЕ конвертирует в студентку автоматически
--       (форма обучения требует ручного оформления — «דורש הבהרה» в документе).
--   • final_approval + 'postponed'        (קבלה נדחית — абитуриентка отложила) —
--       закрывает процесс, reason='postponed'. Без конвертации.
--
-- id этапов резолвим по кодам (не по фикс-UUID) — устойчиво к любой БД.
-- Идемпотентно. Зависит от 20260724100000 (closes_process/process_finish_reason).
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- 1. academic → 'exam_required'
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT st.id, 'exam_required', 'Нужны вступительные экзамены', false, false, NULL, 15
FROM stage_templates st
JOIN process_templates p ON p.id = st.process_template_id AND p.code = 'acceptance'
WHERE st.code = 'academic'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive,
      closes_process = EXCLUDED.closes_process, sort_order = EXCLUDED.sort_order;

-- academic --exam_required--> final_approval (after_all), как approved/rejected.
INSERT INTO stage_transitions (from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order)
SELECT ac.id, fa.id, 'exam_required', 'after_all', 39
FROM stage_templates ac
JOIN process_templates p ON p.id = ac.process_template_id AND p.code = 'acceptance'
JOIN stage_templates fa ON fa.process_template_id = p.id AND fa.code = 'final_approval'
WHERE ac.code = 'academic'
  AND NOT EXISTS (
    SELECT 1 FROM stage_transitions st
    WHERE st.from_stage_template_id = ac.id
      AND st.to_stage_template_id = fa.id
      AND st.trigger_final_code = 'exam_required'
  );

-- 2. final_approval → 'external_studies' + 'postponed' (оба закрывают процесс)
INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
SELECT fa.id, v.code, v.name_ru, v.is_positive, true, v.reason, v.sort_order
FROM stage_templates fa
JOIN process_templates p ON p.id = fa.process_template_id AND p.code = 'acceptance'
CROSS JOIN (VALUES
  ('external_studies', 'Внешнее обучение', true,  'external_studies', 40),
  ('postponed',        'Приём отложен',    false, 'postponed',        50)
) AS v(code, name_ru, is_positive, reason, sort_order)
WHERE fa.code = 'final_approval'
ON CONFLICT (stage_template_id, code) DO UPDATE
  SET name_ru = EXCLUDED.name_ru, is_positive = EXCLUDED.is_positive,
      closes_process = EXCLUDED.closes_process,
      process_finish_reason = EXCLUDED.process_finish_reason,
      sort_order = EXCLUDED.sort_order;
