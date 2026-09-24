-- ═════════════════════════════════════════════════════════════════════
-- «חינוך» и «לימודים» становятся ОДНИМ разделом на экране.
--
-- ─── Что владелец видел ─────────────────────────────────────────────────────
--
-- Две плитки рядом: «כניסה לחינוך ולימודים» и «לימודים». Первая — корень
-- модуля education, в котором после чистки осталось всего три кода.
--
-- Откуда взялась подпись: 20260916130000 брала имя корня из строки 'access'
-- того же модуля, а она в тот момент называлась «כניסה לחינוך ולימודים».
-- Позже 20260917140000 переименовала САМО ПРАВО, но имя УЗЛА не тронула —
-- поэтому на экране осталась старая подпись. Это мой недосмотр, а не данные.
--
-- ─── Что делает миграция ────────────────────────────────────────────────────
--
-- Переносит три оставшихся кода education (access, view, delegate_privileges)
-- в узел «לימודים» и удаляет опустевший корень education. На экране остаётся
-- одна плитка. «גיוס» и «קבלה» остаются отдельными — владелец говорил именно
-- про эти два раздела.
--
-- Это ТОЛЬКО раскладка: security_tree_* не читается авторизацией вообще
-- (страж lib/data-security/tree-isolation.test.ts). Ничьи права не меняются.
--
-- Порядок важен: сначала переносим пункты, потом удаляем узел. Наоборот
-- пункты ушли бы вместе с узлом по ON DELETE CASCADE.
--
-- Идемпотентно: повторный запуск не находит узла education и ничего не делает.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Три кода education переезжают в узел «לימודים» ───────────────────────
UPDATE security_tree_items i
   SET node_id = s.id
  FROM security_tree_nodes s
 WHERE s.module_code = 'studies'
   AND i.module = 'education'
   AND i.node_id IN (SELECT id FROM security_tree_nodes WHERE module_code = 'education');

-- ── 2. Опустевший корень education удаляется ────────────────────────────────
-- Только если в нём действительно ничего не осталось: иначе удаление унесло бы
-- права из дерева, и они молча уехали бы в «ללא תחום».
DELETE FROM security_tree_nodes n
 WHERE n.module_code = 'education'
   AND NOT EXISTS (SELECT 1 FROM security_tree_items i WHERE i.node_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM security_tree_nodes c WHERE c.parent_id = n.id);

-- ── 3. Подпись объединённого раздела ────────────────────────────────────────
-- Теперь он содержит и вход в модуль, поэтому описание это называет.
UPDATE security_tree_nodes SET
  description_he = 'תלמידות, קבוצות, נוכחות וציונים — וגם הכניסה למודול עצמו. גיוס וקבלה הם תחומים נפרדים.',
  description_ru = 'Студентки, группы, посещаемость и оценки — и вход в сам модуль. «Набор» и «Приём» — отдельные разделы.',
  description_en = 'Students, groups, attendance and grades — and the entry to the module itself. Recruitment and Admission are separate areas.'
WHERE module_code = 'studies';

-- ── 4. Самопроверка ─────────────────────────────────────────────────────────
DO $$
DECLARE orphan INT; edu_nodes INT;
BEGIN
  SELECT count(*) INTO orphan
    FROM module_privileges mp
   WHERE NOT EXISTS (SELECT 1 FROM security_tree_items i
                      WHERE i.module = mp.module AND i.privilege_code = mp.privilege_code);
  SELECT count(*) INTO edu_nodes FROM security_tree_nodes WHERE module_code = 'education';

  IF orphan > 0 THEN
    RAISE EXCEPTION 'ОСТАНОВЛЕНО: % прав осталось без узла в дереве', orphan;
  END IF;
  RAISE NOTICE 'Разделов education осталось: % (ожидается 0). Прав без узла: 0', edu_nodes;
END $$;
