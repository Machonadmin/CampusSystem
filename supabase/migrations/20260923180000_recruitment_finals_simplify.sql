-- ═══════════════════════════════════════════════════════════════════════
-- УПРОЩЕНИЕ ИСХОДОВ ЭТАПОВ «Набора» (решение владельца, 2026-09-23).
--
-- Претензия владельца: «нет причины иметь столько подпутей внутри этапа —
-- если есть этап, то одобрить и двигаться дальше; закрыть тоже должно быть
-- возможно всегда, но не обязательно».
--
-- Проверка по данным подтвердила её: у этапов documents и event ВСЕ исходы
-- вели в ОДИН И ТОТ ЖЕ следующий этап (decision). Три кнопки = одна дорога,
-- отличались только подписью. Это и есть лишняя сложность.
--
--   documents:  all_collected | partial | not_provided  → все три → decision
--   event:      feedback_received | no_show | refused    → все три → decision
--
-- Было 13 исходов → стало 9:
--   contact    done_event_yes · done_event_skip · rejected
--   documents  all_collected · rejected            (rejected — НОВЫЙ)
--   event      feedback_received · rejected        (rejected — НОВЫЙ)
--   decision   convert_to_applicant · rejected
--
-- Удаляются: contact/postponed, documents/partial, documents/not_provided,
--            event/no_show, event/refused, decision/postponed.
-- `postponed` — по прямому указанию владельца («не используем»).
--
-- ИСТОРИЯ НЕ ЛОМАЕТСЯ: stage_instances.final_code — TEXT, а не FK, и подпись
-- берётся из messages/*.json по коду. Ключи переводов сохранены намеренно,
-- поэтому уже закрытые этапы продолжают показывать человекочитаемый исход.
--
-- Переходы, ссылающиеся на удаляемые коды (trigger_final_code), удаляются
-- вместе с ними — иначе остались бы недостижимые строки.
--
-- Идемпотентно. Одна транзакция + проверка в конце.
-- Применять ВРУЧНУЮ в Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_proc      uuid;
  v_contact   uuid;
  v_documents uuid;
  v_event     uuid;
  v_decision  uuid;
  v_n         int;
BEGIN
  SELECT id INTO v_proc FROM process_templates WHERE code = 'recruitment';
  IF v_proc IS NULL THEN RAISE EXCEPTION 'Шаблон «recruitment» не найден'; END IF;

  SELECT id INTO v_contact   FROM stage_templates WHERE process_template_id = v_proc AND code = 'contact';
  SELECT id INTO v_documents FROM stage_templates WHERE process_template_id = v_proc AND code = 'documents';
  SELECT id INTO v_event     FROM stage_templates WHERE process_template_id = v_proc AND code = 'event';
  SELECT id INTO v_decision  FROM stage_templates WHERE process_template_id = v_proc AND code = 'decision';
  IF v_contact IS NULL OR v_documents IS NULL OR v_event IS NULL OR v_decision IS NULL THEN
    RAISE EXCEPTION 'У «recruitment» отсутствуют этапы';
  END IF;

  -- 1. Новый исход «закрыть дело» на documents и event (владелец: «всегда
  --    должна быть возможность, но не обязательно»). closes_process = true,
  --    поэтому переход ему не нужен — движок закрывает процесс сам.
  INSERT INTO stage_finals (stage_template_id, code, name_ru, is_positive, closes_process, process_finish_reason, sort_order)
  VALUES
    (v_documents, 'rejected', 'Отказ', false, true, 'rejected', 90),
    (v_event,     'rejected', 'Отказ', false, true, 'rejected', 90)
  ON CONFLICT (stage_template_id, code) DO NOTHING;

  -- 2. Переходы на удаляемые коды — сначала они, потом сами исходы.
  DELETE FROM stage_transitions
   WHERE (from_stage_template_id = v_documents AND trigger_final_code IN ('partial', 'not_provided'))
      OR (from_stage_template_id = v_event     AND trigger_final_code IN ('no_show', 'refused'))
      OR (from_stage_template_id = v_contact   AND trigger_final_code = 'postponed')
      OR (from_stage_template_id = v_decision  AND trigger_final_code = 'postponed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'удалено переходов: %', v_n;

  -- 3. Лишние исходы.
  DELETE FROM stage_finals
   WHERE (stage_template_id = v_documents AND code IN ('partial', 'not_provided'))
      OR (stage_template_id = v_event     AND code IN ('no_show', 'refused'))
      OR (stage_template_id = v_contact   AND code = 'postponed')
      OR (stage_template_id = v_decision  AND code = 'postponed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'удалено исходов: %', v_n;
END $$;

-- ─── Проверка ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_proc  uuid;
  v_total int;
  r       RECORD;
BEGIN
  SELECT id INTO v_proc FROM process_templates WHERE code = 'recruitment';

  SELECT count(*) INTO v_total
    FROM stage_finals sf
    JOIN stage_templates st ON st.id = sf.stage_template_id
   WHERE st.process_template_id = v_proc;
  IF v_total <> 9 THEN
    RAISE EXCEPTION 'У «recruitment» % исходов вместо 9 — откат', v_total;
  END IF;

  -- Каждый этап обязан сохранить хотя бы один исход, иначе его не закрыть.
  FOR r IN
    SELECT st.code AS stage
      FROM stage_templates st
     WHERE st.process_template_id = v_proc
       AND NOT EXISTS (SELECT 1 FROM stage_finals sf WHERE sf.stage_template_id = st.id)
  LOOP
    RAISE EXCEPTION 'У этапа «%» не осталось исходов — откат', r.stage;
  END LOOP;

  -- Ни один оставшийся переход не должен ссылаться на удалённый исход.
  FOR r IN
    SELECT tr.trigger_final_code AS code, st.code AS stage
      FROM stage_transitions tr
      JOIN stage_templates st ON st.id = tr.from_stage_template_id
     WHERE st.process_template_id = v_proc
       AND tr.trigger_final_code IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM stage_finals sf
          WHERE sf.stage_template_id = tr.from_stage_template_id
            AND sf.code = tr.trigger_final_code)
  LOOP
    RAISE EXCEPTION 'Переход «%» с этапа «%» ссылается на удалённый исход — откат', r.code, r.stage;
  END LOOP;
END $$;

COMMIT;
