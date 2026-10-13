-- ═════════════════════════════════════════════════════════════════════
-- Удаление устаревших прав «בקשות (ישן, לא בשימוש)» — модуль `applicants`.
--
-- Решение владельца 2026-10-13 (замечание сотрудника d0589f21): «אם בקשות
-- לא בשימוש אז למחוק» → «אכן».
--
-- Пять кодов (view, create, edit, change_status, delete) остались от схемы до
-- перехода на «קבלה». Их не читает НИ ОДНА проверка в коде: маршрута
-- /dashboard/applicants нет, права приёма живут в модуле admission. Поэтому
-- снятие их у кого бы то ни было ничего не закрывает.
--
-- Удаляется всё, что относится к модулю: выдачи ролям и людям (их удаление
-- пишется в журнал изменений), раскладка на экране, сами строки каталога и
-- раздел «בקשות (ישן, לא בשימוש)».
--
-- Если в этот раздел перетащили что-то чужое или вложили подраздел, блок
-- останавливается с ошибкой и ничего не удаляет — чтобы не снести каскадом
-- чужие права с экрана.
--
-- Идемпотентно: повторный прогон ничего не находит.
-- Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n_foreign  INT;
  n_children INT;
BEGIN
  SELECT count(*) INTO n_foreign
    FROM security_tree_items i
    JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = 'applicants' AND i.module <> 'applicants';

  SELECT count(*) INTO n_children
    FROM security_tree_nodes c
    JOIN security_tree_nodes n ON n.id = c.parent_id
   WHERE n.module_code = 'applicants';

  IF n_foreign > 0 OR n_children > 0 THEN
    RAISE EXCEPTION 'В разделе «בקשות» лежат чужие права (%) или подразделы (%). Ничего не удалено.',
      n_foreign, n_children;
  END IF;

  DELETE FROM role_privileges     WHERE module = 'applicants';
  DELETE FROM person_privileges   WHERE module = 'applicants';
  DELETE FROM security_tree_items WHERE module = 'applicants';
  DELETE FROM module_privileges   WHERE module = 'applicants';
  DELETE FROM security_tree_nodes WHERE module_code = 'applicants';
END $$;
