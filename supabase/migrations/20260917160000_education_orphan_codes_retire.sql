-- ═════════════════════════════════════════════════════════════════════
-- Остаток «Образования»: коды, которых не было в каталоге.
--
-- ─── Что не сработало в 20260917140000 ──────────────────────────────────────
--
-- Та миграция строила список переноса из КАТАЛОГА (module_privileges: помечен
-- устаревшим + есть superseded_by). Этого оказалось мало.
--
-- Разделение education на recruitment/admission/studies (20260819120000) не
-- только перенесло гранты, но и УДАЛИЛО тонкие коды education из каталога.
-- А более поздние миграции, заводившие роли (20260901150000 «אחראית יהדות»,
-- 20260903110000 «רב לימודי יהדות» и соседние), снова писали гранты ПОД МОДУЛЬ
-- education — теми кодами, которых в каталоге education уже не было.
--
-- Результат на базе владельца: 8 строк role_privileges остались под education,
-- и первая миграция их не увидела, потому что смотрела только в каталог:
--
--   create_kodesh_course, approve_kodesh_teacher, set_teacher_quota,
--   jewishness_initial_check   — רב לימודי יהדות
--   jewishness_final_approve   — אחראית יהדות
--   manage_alerts              — אחראית יהדות + два администратора
--
-- Ничьи права при этом не пострадали и не выросли: авторизация читает
-- education вместе с тремя новыми модулями (EDU_PRIV_MODULES,
-- lib/education/permissions.ts), поэтому строка под education и та же строка
-- под studies для проверки равносильны.
--
-- ─── Что делает эта миграция ────────────────────────────────────────────────
--
-- Идёт от ФАКТА, а не от каталога: берёт то, что реально лежит в
-- role_privileges / person_privileges под education (кроме трёх кодов, которые
-- остаются), и для каждого ищет код С ТЕМ ЖЕ ИМЕНЕМ среди трёх новых модулей.
--
--   • нашёлся РОВНО ОДИН — переносит, сохраняя scope, и удаляет старую строку;
--   • не нашёлся или нашлось несколько — НЕ ТРОГАЕТ и называет вслух.
--     Угадывать, куда девать право, которое держит живой человек, нельзя.
--
-- Scope расширяется до максимального — та же логика, что reduceScopes в коде
-- (all > department > own): если строка-преемник уже была, но в более узком
-- scope, простое удаление старой понизило бы человека.
--
-- Личные строки переносятся вместе с запретами; при столкновении побеждает
-- запрет — как решает applyPersonGrants.
--
-- ─── Временных таблиц здесь НЕТ ─────────────────────────────────────────────
-- В 20260917140000 они были, и SQL Editor из-за них ругался на RLS. Здесь всё
-- собрано на обычных CTE, а самопроверка стоит ДО удаления — так предупреждение
-- про RLS не появляется вовсе. Останется только «destructive operations»:
-- это верно, миграция действительно удаляет строки.
--
-- Идемпотентно: повторный запуск не находит строк под education и ничего не
-- делает. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Роли: добавить преемников ────────────────────────────────────────────
WITH orphan AS (
  SELECT rp.role_id, rp.privilege_code,
         max(CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END) AS rank
    FROM role_privileges rp
   WHERE rp.module = 'education'
     AND rp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
   GROUP BY rp.role_id, rp.privilege_code
),
target AS (
  SELECT o.role_id, o.privilege_code, o.rank, mp.module AS new_module
    FROM orphan o
    JOIN module_privileges mp
      ON mp.privilege_code = o.privilege_code
     AND mp.module IN ('studies', 'recruitment', 'admission')
   -- Ровно один кандидат: иначе неясно, куда переносить, и мы не трогаем.
   WHERE (SELECT count(*) FROM module_privileges m2
           WHERE m2.privilege_code = o.privilege_code
             AND m2.module IN ('studies', 'recruitment', 'admission')) = 1
)
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT t.role_id, t.new_module, t.privilege_code,
       CASE t.rank WHEN 3 THEN 'all' WHEN 2 THEN 'department' ELSE 'own' END
  FROM target t
ON CONFLICT (role_id, module, privilege_code) DO NOTHING;

-- ── 2. Роли: расширить scope у уже существовавшего преемника ────────────────
WITH orphan AS (
  SELECT rp.role_id, rp.privilege_code,
         max(CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END) AS rank
    FROM role_privileges rp
   WHERE rp.module = 'education'
     AND rp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
   GROUP BY rp.role_id, rp.privilege_code
),
target AS (
  SELECT o.role_id, o.privilege_code, o.rank, mp.module AS new_module
    FROM orphan o
    JOIN module_privileges mp
      ON mp.privilege_code = o.privilege_code
     AND mp.module IN ('studies', 'recruitment', 'admission')
   WHERE (SELECT count(*) FROM module_privileges m2
           WHERE m2.privilege_code = o.privilege_code
             AND m2.module IN ('studies', 'recruitment', 'admission')) = 1
)
UPDATE role_privileges rp
   SET scope = CASE t.rank WHEN 3 THEN 'all' WHEN 2 THEN 'department' ELSE 'own' END
  FROM target t
 WHERE rp.role_id = t.role_id
   AND rp.module = t.new_module
   AND rp.privilege_code = t.privilege_code
   AND CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END < t.rank;

-- ── 3. Личные строки ────────────────────────────────────────────────────────
WITH orphan AS (
  SELECT pp.person_id, pp.privilege_code,
         bool_and(pp.is_granted) AS granted,
         CASE WHEN bool_or(pp.expires_at IS NULL) THEN NULL ELSE max(pp.expires_at) END AS expires_at
    FROM person_privileges pp
   WHERE pp.module = 'education'
     AND pp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
   GROUP BY pp.person_id, pp.privilege_code
),
target AS (
  SELECT o.person_id, o.privilege_code, o.granted, o.expires_at, mp.module AS new_module
    FROM orphan o
    JOIN module_privileges mp
      ON mp.privilege_code = o.privilege_code
     AND mp.module IN ('studies', 'recruitment', 'admission')
   WHERE (SELECT count(*) FROM module_privileges m2
           WHERE m2.privilege_code = o.privilege_code
             AND m2.module IN ('studies', 'recruitment', 'admission')) = 1
)
INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, expires_at, reason)
SELECT t.person_id, t.new_module, t.privilege_code, t.granted, t.expires_at,
       'Перенесено с модуля education: код остался под старым модулем после разделения'
  FROM target t
ON CONFLICT (person_id, module, privilege_code) DO NOTHING;

-- ── 4. Самопроверка ДО удаления ─────────────────────────────────────────────
-- Стоит здесь, а не после: удалять можно только то, преемник чего уже на месте.
DO $$
DECLARE lost INT; sample TEXT;
BEGIN
  SELECT count(*), string_agg(t.privilege_code, ', ')
    INTO lost, sample
    FROM (
      SELECT o.role_id, o.privilege_code, o.rank, mp.module AS new_module
        FROM (
          SELECT rp.role_id, rp.privilege_code,
                 max(CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END) AS rank
            FROM role_privileges rp
           WHERE rp.module = 'education'
             AND rp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
           GROUP BY rp.role_id, rp.privilege_code
        ) o
        JOIN module_privileges mp
          ON mp.privilege_code = o.privilege_code
         AND mp.module IN ('studies', 'recruitment', 'admission')
       WHERE (SELECT count(*) FROM module_privileges m2
               WHERE m2.privilege_code = o.privilege_code
                 AND m2.module IN ('studies', 'recruitment', 'admission')) = 1
    ) t
   WHERE NOT EXISTS (
     SELECT 1 FROM role_privileges rp
      WHERE rp.role_id = t.role_id AND rp.module = t.new_module AND rp.privilege_code = t.privilege_code
        AND CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END >= t.rank
   );

  IF lost > 0 THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: % пар (роль, право) не получили преемника с нужным scope: %', lost, sample;
  END IF;
  RAISE NOTICE 'Проверка пройдена: преемники на месте, можно удалять старые строки';
END $$;

-- ── 5. Удалить перенесённые строки ──────────────────────────────────────────
-- Только те, у кого преемник однозначен: остальные остаются и названы ниже.
DELETE FROM role_privileges rp
 WHERE rp.module = 'education'
   AND rp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
   AND (SELECT count(*) FROM module_privileges m2
         WHERE m2.privilege_code = rp.privilege_code
           AND m2.module IN ('studies', 'recruitment', 'admission')) = 1;

DELETE FROM person_privileges pp
 WHERE pp.module = 'education'
   AND pp.privilege_code NOT IN ('access', 'delegate_privileges', 'view')
   AND (SELECT count(*) FROM module_privileges m2
         WHERE m2.privilege_code = pp.privilege_code
           AND m2.module IN ('studies', 'recruitment', 'admission')) = 1;

-- ── 6. Что осталось ─────────────────────────────────────────────────────────
-- Не EXCEPTION: остаток означает «я не знаю, куда это девать», и это повод
-- спросить человека, а не заблокировать уже сделанную работу.
DO $$
DECLARE n INT; sample TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT privilege_code, ', ')
    INTO n, sample
    FROM role_privileges
   WHERE module = 'education'
     AND privilege_code NOT IN ('access', 'delegate_privileges', 'view');

  IF n > 0 THEN
    RAISE WARNING 'Под education осталось строк: % (%). У этих кодов нет однозначного преемника — решать вручную.', n, sample;
  ELSE
    RAISE NOTICE 'Под education не осталось ни одной тонкой строки: разделение завершено';
  END IF;
END $$;
