-- ═════════════════════════════════════════════════════════════════════
-- Названия задач этапов набора (גיוס) — на иврите.
--
-- Решение владельца 2026-09-24: ТОЛЬКО перевести названия. Состав задач
-- (в т.ч. три задачи «Мероприятия») не меняется. Автоматика процесса
-- (task_transitions, stage_transitions, финалы) ссылается на КОДЫ задач,
-- а не на названия, поэтому не затрагивается.
--
-- Меняются только шаблоны (stage_task_templates.title) — новые задачи
-- получат иврит. Уже созданные задачи (tasks.title) не трогаем.
-- Идемпотентно.
-- ═════════════════════════════════════════════════════════════════════

UPDATE stage_task_templates stt
SET title = v.title_he
FROM (VALUES
  ('first_contact', 'ליצור קשר עם ליד חדש'),
  ('collect_docs',  'לאסוף מסמכים'),
  ('verify_docs',   'לבדוק מסמכים'),
  ('invite_event',  'להזמין לאירוע'),
  ('arrange_trip',  'לארגן הגעה'),
  ('get_feedback',  'לקבל משוב'),
  ('make_decision', 'לקבל החלטה על הליד')
) AS v(code, title_he),
stage_templates st,
process_templates pt
WHERE stt.code = v.code
  AND stt.stage_template_id = st.id
  AND st.process_template_id = pt.id
  AND pt.code = 'recruitment';
