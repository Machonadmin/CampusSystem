-- ═════════════════════════════════════════════════════════════════════
-- Вывод старых кодов «Образования» из обращения.
--
-- ─── Что чинится ────────────────────────────────────────────────────────────
--
-- В августе модуль education был разделён на recruitment / admission / studies,
-- но 22 старых кода НИКТО не удалил. Авторизация читает все четыре модуля
-- (EDU_PRIV_MODULES, lib/education/permissions.ts), поэтому ничего не сломалось —
-- зато каталог показывает два поколения одного и того же права, и на экране
-- «Безопасности данных» это выглядит как два разных раздела с двумя входами.
-- Владелец, глядя на экран, спросил ровно это: «почему два?».
--
-- ─── Что делает миграция ────────────────────────────────────────────────────
--
-- 1. Переносит ДЕРЖАТЕЛЕЙ старых кодов на коды-преемники (superseded_by),
--    сохраняя scope, и только потом удаляет старые строки.
-- 2. Удаляет старые коды из каталога и из раскладки дерева.
-- 3. Оставляет ТРИ кода education, которые преемников не имеют и живут в коде:
--       • access              — гейт модуля (middleware, visibleModules);
--       • delegate_privileges — читается ЯВНО как ('education','delegate_privileges')
--                               в lib/education/unit-access.ts:47;
--       • view                — не помечен устаревшим; удалять то, в чём не
--                               уверены, опаснее, чем оставить.
--
-- ─── Почему это не меняет ничьих прав ───────────────────────────────────────
--
-- Проверка кода идёт по ПАРЕ (module, privilege_code) через список из четырёх
-- модулей. Строка ('education','set_grades') и строка ('studies','set_grades')
-- для авторизации равносильны. Поэтому «добавить преемника → удалить старую»
-- оставляет результат тем же.
--
-- ОДИН случай мог бы сузить доступ: строка-преемник УЖЕ была, но с более узким
-- scope ('department' против 'all' у старой). Тогда простое удаление старой
-- строки понизило бы человека. Поэтому scope преемника РАСШИРЯЕТСЯ до
-- максимального из старых — той же логикой, что reduceScopes в коде
-- (all > department > own).
--
-- Личные строки (person_privileges) переносятся ВМЕСТЕ С ЗАПРЕТАМИ. Если у
-- человека по одному и тому же преемнику оказываются и выдача, и запрет,
-- побеждает ЗАПРЕТ — так же, как applyPersonGrants решает это сегодня.
-- Ошибиться в сторону «закрыто» здесь безопаснее, чем в сторону «открыто».
--
-- ─── Мёртвый код расписания заменяется на НАСТОЯЩИЙ ─────────────────────────
--
-- education.manage_schedule не читается НИ ОДНОЙ строкой кода: расписание и
-- сегодня, и раньше гейтится set_lesson_topics
-- (app/api/education/timetable/route.ts:52 — canEdit;
--  app/api/education/schedule/slots/[slotId]/route.ts:93,257 — PATCH и DELETE).
--
-- При этом 20260901150000_jewish_studies_manager_role.sql:54-61 выдал его роли
-- «אחראית יהדות» вместе с её настоящими правами и с прямым комментарием
-- «расписание (часы/классы)». То есть НАМЕРЕНИЕ было — «она ведёт расписание
-- своего подразделения», а выданный код этого никогда не делал.
--
-- Владелец, увидев это, выбрал: удалить мёртвый код и дать настоящий. Поэтому
-- manage_schedule объявляется устаревшим В ПОЛЬЗУ studies.set_lesson_topics, и
-- дальше его обрабатывает тот же механизм, что и остальные 20 кодов: перенос
-- держателей с сохранением scope, расширение scope у уже существующей строки,
-- удаление старой, самопроверка.
--
-- ЭТО ЕДИНСТВЕННОЕ МЕСТО В МИГРАЦИИ, ГДЕ ПОЯВЛЯЕТСЯ НОВАЯ ВОЗМОЖНОСТЬ, а не
-- сохраняется прежняя. Поэтому миграция называет вслух, кто её получил.
--
-- ─── Что будет ПОТЕРЯНО осознанно ───────────────────────────────────────────
--
-- Один старый код преемника не имеет и в приложении не упоминается вообще:
-- education.view_own_only. Его выдачи удаляются: он ничего не открывал.
-- Миграция называет вслух, у скольких ролей и людей он был, — чтобы это было
-- видно, а не «просто исчезло».
--
-- Идемпотентно: повторный запуск не находит старых кодов и ничего не делает.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS _edu_map;
DROP TABLE IF EXISTS _edu_before;

-- ── 0. Расписание: мёртвый код получает настоящего преемника ────────────────
-- Делается ДО построения карты — дальше manage_schedule идёт общим потоком.
UPDATE module_privileges
   SET superseded_by = 'studies.set_lesson_topics'
 WHERE module = 'education'
   AND privilege_code = 'manage_schedule'
   AND superseded_by IS NULL;

-- ── 1. Карта «старый код → преемник» ────────────────────────────────────────
-- Берётся из самого каталога, а не из списка в тексте миграции: список в тексте
-- разошёлся бы с базой при следующей правке каталога.
CREATE TEMP TABLE _edu_map AS
SELECT mp.privilege_code                        AS old_code,
       split_part(mp.superseded_by, '.', 1)     AS new_module,
       split_part(mp.superseded_by, '.', 2)     AS new_code
  FROM module_privileges mp
 WHERE mp.module = 'education'
   AND mp.is_legacy
   AND mp.superseded_by IS NOT NULL
   -- Преемник обязан существовать в каталоге: перенос в несуществующий код
   -- был бы тихой потерей права.
   AND EXISTS (
     SELECT 1 FROM module_privileges s
      WHERE s.module = split_part(mp.superseded_by, '.', 1)
        AND s.privilege_code = split_part(mp.superseded_by, '.', 2)
   );

-- Снимок «до» — нужен для самопроверки уже ПОСЛЕ удаления старых строк.
CREATE TEMP TABLE _edu_before AS
SELECT rp.role_id, m.new_module, m.new_code,
       max(CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END) AS rank
  FROM role_privileges rp
  JOIN _edu_map m ON m.old_code = rp.privilege_code
 WHERE rp.module = 'education'
 GROUP BY rp.role_id, m.new_module, m.new_code;

DO $$
DECLARE n_map INT; n_rp INT; n_pp INT;
BEGIN
  SELECT count(*) INTO n_map FROM _edu_map;
  SELECT count(*) INTO n_rp FROM role_privileges rp JOIN _edu_map m ON m.old_code = rp.privilege_code WHERE rp.module = 'education';
  SELECT count(*) INTO n_pp FROM person_privileges pp JOIN _edu_map m ON m.old_code = pp.privilege_code WHERE pp.module = 'education';
  RAISE NOTICE 'Кодов с преемником: %. Строк ролей к переносу: %. Личных строк к переносу: %', n_map, n_rp, n_pp;
END $$;

-- Единственная новая возможность в этой миграции — назвать её поимённо.
DO $$
DECLARE who TEXT; n INT;
BEGIN
  SELECT count(*), string_agg(DISTINCT ro.name, ', ')
    INTO n, who
    FROM role_privileges rp JOIN roles ro ON ro.id = rp.role_id
   WHERE rp.module = 'education' AND rp.privilege_code = 'manage_schedule';
  IF n > 0 THEN
    RAISE NOTICE 'НОВАЯ ВОЗМОЖНОСТЬ: studies.set_lesson_topics (ведение расписания) получают роли: %', who;
  ELSE
    RAISE NOTICE 'Мёртвый код расписания ни у кого не был выдан — новых возможностей не появляется';
  END IF;
END $$;

-- ── 2. Роли: добавить преемников ────────────────────────────────────────────
-- Агрегируем ДО вставки: два старых кода могут вести к одному преемнику
-- (manage_groups и manage_class_groups → studies.manage_class_groups), и без
-- агрегации в одном INSERT оказались бы две строки с одним ключом.
INSERT INTO role_privileges (role_id, module, privilege_code, scope)
SELECT b.role_id, b.new_module, b.new_code,
       CASE b.rank WHEN 3 THEN 'all' WHEN 2 THEN 'department' ELSE 'own' END
  FROM _edu_before b
ON CONFLICT (role_id, module, privilege_code) DO NOTHING;

-- ── 3. Роли: расширить scope там, где преемник уже был, но уже́ ──────────────
UPDATE role_privileges t
   SET scope = CASE b.rank WHEN 3 THEN 'all' WHEN 2 THEN 'department' ELSE 'own' END
  FROM _edu_before b
 WHERE t.role_id = b.role_id
   AND t.module = b.new_module
   AND t.privilege_code = b.new_code
   AND CASE t.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END < b.rank;

-- ── 4. Личные строки: перенести вместе с запретами ──────────────────────────
-- bool_and(is_granted): если хоть одна строка — запрет, преемник тоже запрет.
-- expires_at: NULL (бессрочно) сильнее любой даты, иначе самая поздняя.
INSERT INTO person_privileges (person_id, module, privilege_code, is_granted, expires_at, reason)
SELECT pp.person_id, m.new_module, m.new_code,
       bool_and(pp.is_granted),
       CASE WHEN bool_or(pp.expires_at IS NULL) THEN NULL ELSE max(pp.expires_at) END,
       'Перенесено со старого кода education при выводе дублей из обращения'
  FROM person_privileges pp
  JOIN _edu_map m ON m.old_code = pp.privilege_code
 WHERE pp.module = 'education'
 GROUP BY pp.person_id, m.new_module, m.new_code
ON CONFLICT (person_id, module, privilege_code) DO NOTHING;

-- Отдельно назвать вслух перенесённые ЗАПРЕТЫ: это единственное место, где
-- поведение может измениться (личный запрет на старый код начинает закрывать
-- код-преемник). Обычно таких строк нет вовсе.
DO $$
DECLARE d INT; who TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT p.full_name, ', ')
    INTO d, who
    FROM person_privileges pp
    JOIN _edu_map m ON m.old_code = pp.privilege_code
    LEFT JOIN persons p ON p.id = pp.person_id
   WHERE pp.module = 'education' AND pp.is_granted = false;
  IF d > 0 THEN
    RAISE NOTICE 'ВНИМАНИЕ: перенесено личных ЗАПРЕТОВ: % (%). Теперь они закрывают код-преемник — проверьте этих людей на экране.', d, COALESCE(who, '—');
  ELSE
    RAISE NOTICE 'Личных запретов на старых кодах не было — переносились только выдачи';
  END IF;
END $$;

-- ── 5. Удалить выдачи старых кодов ──────────────────────────────────────────
-- Сначала те, у кого есть преемник (он уже проставлен выше).
DELETE FROM role_privileges rp
 USING _edu_map m
 WHERE rp.module = 'education' AND rp.privilege_code = m.old_code;

DELETE FROM person_privileges pp
 USING _edu_map m
 WHERE pp.module = 'education' AND pp.privilege_code = m.old_code;

-- Затем код без преемника — с поимённым отчётом, что именно исчезает.
DO $$
DECLARE r_cnt INT; p_cnt INT; who TEXT;
BEGIN
  SELECT count(*) INTO r_cnt FROM role_privileges
   WHERE module = 'education' AND privilege_code = 'view_own_only';
  SELECT count(*) INTO p_cnt FROM person_privileges
   WHERE module = 'education' AND privilege_code = 'view_own_only';

  SELECT string_agg(DISTINCT ro.name, ', ') INTO who
    FROM role_privileges rp JOIN roles ro ON ro.id = rp.role_id
   WHERE rp.module = 'education' AND rp.privilege_code = 'view_own_only';

  IF r_cnt > 0 OR p_cnt > 0 THEN
    RAISE NOTICE 'Код без преемника (view_own_only) удаляется: у ролей — % (%), личных — %. Он не проверялся ни одной строкой кода.',
      r_cnt, COALESCE(who, '—'), p_cnt;
  ELSE
    RAISE NOTICE 'Кода без преемника ни у кого не было';
  END IF;
END $$;

DELETE FROM role_privileges
 WHERE module = 'education' AND privilege_code = 'view_own_only';
DELETE FROM person_privileges
 WHERE module = 'education' AND privilege_code = 'view_own_only';

-- ── 6. Самопроверка ДО удаления каталога ────────────────────────────────────
-- Каждая пара (роль, преемник) из снимка обязана существовать со scope не ниже.
DO $$
DECLARE lost INT; sample TEXT;
BEGIN
  SELECT count(*), string_agg(b.new_module || '.' || b.new_code, ', ')
    INTO lost, sample
    FROM _edu_before b
   WHERE NOT EXISTS (
     SELECT 1 FROM role_privileges rp
      WHERE rp.role_id = b.role_id AND rp.module = b.new_module AND rp.privilege_code = b.new_code
        AND CASE rp.scope WHEN 'all' THEN 3 WHEN 'department' THEN 2 WHEN 'own' THEN 1 ELSE 0 END >= b.rank
   );

  IF lost > 0 THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: % пар (роль, право) не получили преемника с нужным scope: %', lost, sample;
  END IF;
  RAISE NOTICE 'Проверка переноса пройдена: ни одна роль не потеряла доступ';
END $$;

-- ── 7. Убрать старые коды из раскладки дерева и из каталога ─────────────────
DELETE FROM security_tree_items i
 USING module_privileges mp
 WHERE i.module = 'education' AND i.privilege_code = mp.privilege_code
   AND mp.module = 'education' AND mp.is_legacy;

DELETE FROM module_privileges
 WHERE module = 'education' AND is_legacy;

-- ── 8. Подпись входа ────────────────────────────────────────────────────────
-- Прежняя подпись «כניסה לחינוך ולימודים» и была причиной вопроса «почему два
-- входа»: она называла ДВА раздела, будучи одним правом.
UPDATE module_privileges SET
  name_he = 'כניסה למודול החינוך',
  name_ru = 'Вход в модуль образования',
  name_en = 'Open the education module',
  description_he = 'פותח את המודול בתפריט. ההרשאות המפורטות יושבות בתחומים גיוס, קבלה ולימודים.',
  description_ru = 'Открывает модуль в меню. Тонкие права живут в разделах «Набор», «Приём» и «Учёба».',
  description_en = 'Opens the module in the menu. The detailed permissions live in Recruitment, Admission and Studies.'
WHERE module = 'education' AND privilege_code = 'access';

-- ── 9. Итог ─────────────────────────────────────────────────────────────────
DO $$
DECLARE left_over INT; codes TEXT;
BEGIN
  SELECT count(*), string_agg(privilege_code, ', ' ORDER BY privilege_code)
    INTO left_over, codes
    FROM module_privileges WHERE module = 'education';
  RAISE NOTICE 'В модуле education осталось кодов: % (%)', left_over, codes;
END $$;

DROP TABLE IF EXISTS _edu_map;
DROP TABLE IF EXISTS _edu_before;
