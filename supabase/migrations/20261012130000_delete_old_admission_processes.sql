-- ═════════════════════════════════════════════════════════════════════
-- Удаление старых шаблонов процессов «Приём»: `acceptance` и `admission`.
--
-- Решение владельца 2026-10-11: «בוא נשמיד לגמרי מה שלא רלוונטי». Условие
-- было одно — по этим шаблонам нет ни одного дела. Проверка владельца
-- 2026-10-12: у `acceptance` и `admission` 0 открытых и 0 закрытых дел.
--
--   `acceptance` — старый параллельный комитет (20260713170000). Новые
--                  приёмы давно стартуют по `acceptance_v2`.
--   `admission`  — одноэтапный «Приём» v1, выключен в 20260724120000.
--
-- Остаются `acceptance_v2` (текущий приём) и `recruitment` (набор).
--
-- Этапы, задачи этапов, финалы и переходы удаляются каскадом вместе с
-- шаблоном (ON DELETE CASCADE). Если по шаблону всё же есть дело, блок
-- останавливается с ошибкой и ничего не удаляет. Идемпотентно: повторный
-- прогон ничего не находит.
--
-- Внимание: старые миграции-«ремонты» (20260724160000, 20260923160000)
-- заново вставляют эти шаблоны. Повторно их не прогонять.
--
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n_processes INT;
  n_stages    INT;
BEGIN
  SELECT count(*) INTO n_processes
  FROM process_instances pi
  JOIN process_templates pt ON pt.id = pi.process_template_id
  WHERE pt.code IN ('acceptance', 'admission');

  SELECT count(*) INTO n_stages
  FROM stage_instances si
  JOIN stage_templates st ON st.id = si.stage_template_id
  JOIN process_templates pt ON pt.id = st.process_template_id
  WHERE pt.code IN ('acceptance', 'admission');

  IF n_processes > 0 OR n_stages > 0 THEN
    RAISE EXCEPTION 'По старым шаблонам есть дела (процессов: %, этапов: %). Ничего не удалено.',
      n_processes, n_stages;
  END IF;

  DELETE FROM process_templates WHERE code IN ('acceptance', 'admission');
END $$;
