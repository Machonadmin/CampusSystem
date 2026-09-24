-- ═════════════════════════════════════════════════════════════════════
-- BACKFILL: запуск процесса «Набор» для лидов, у которых его нет.
--
-- ПРОБЛЕМА (ошибка #1): лиды, заведённые ДО того, как шаблон 'recruitment'
-- появился в БД (сид 20260724110000), создавались без экземпляра процесса —
-- автозапуск start_process('recruitment') тогда тихо падал (шаблона не было).
-- У таких лидов нет ни одного подэтапа «Набора», поэтому кнопка/действие
-- «Перевести в мועмדת» не находит закрывающий этап → ошибка, тупик.
--
-- Эта миграция ИДЕМПОТЕНТНО заводит «Набор» для каждого journey со статусом
-- 'lead', у которого НЕТ активного экземпляра 'recruitment'. Актор — системная
-- персона (та же, что у публичной формы, app/api/public/applications), поэтому
-- стартовая задача «Связаться с новым лидом» назначается на системный пул —
-- ровно как у заявок с публичной формы. Новые лиды уже получают процесс
-- автоматически; это разовый ремонт исторических.
--
-- Ничего не удаляет; повторный прогон — no-op (guard NOT EXISTS).
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_system_person uuid := 'ffffffff-0000-4000-8000-000000000001';
  v_rec_template  uuid;
  v_journey       uuid;
  v_count         int := 0;
BEGIN
  SELECT id INTO v_rec_template FROM process_templates WHERE code = 'recruitment';
  IF v_rec_template IS NULL THEN
    RAISE NOTICE 'Шаблон recruitment не найден — пропуск (сначала примените 20260724110000)';
    RETURN;
  END IF;

  -- Системная персона должна существовать (иначе триггер tasks_validate_account
  -- отклонит стартовую задачу). Если её нет — не рискуем, выходим с сообщением.
  IF NOT EXISTS (SELECT 1 FROM person_accounts WHERE person_id = v_system_person AND is_active) THEN
    RAISE NOTICE 'Системная персона % без активного person_account — backfill пропущен', v_system_person;
    RETURN;
  END IF;

  FOR v_journey IN
    SELECT j.id
    FROM education_journeys j
    WHERE j.education_status = 'lead'
      AND NOT EXISTS (
        SELECT 1 FROM process_instances pi
        WHERE pi.journey_id = j.id
          AND pi.status = 'active'
          AND pi.process_template_id = v_rec_template
      )
  LOOP
    PERFORM start_process('recruitment', v_journey, v_system_person);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfill «Набор»: запущено для % лидов', v_count;
END $$;
