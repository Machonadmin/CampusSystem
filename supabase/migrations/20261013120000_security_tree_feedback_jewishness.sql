-- ═════════════════════════════════════════════════════════════════════
-- Экран «אבטחת מידע»: два переноса в дереве ОТОБРАЖЕНИЯ прав.
-- Решения владельца 2026-10-13 (замечания сотрудников bcabaf37 и 1625e82d).
--
-- 1. Право feedback.submit («שליחת הצעות לשיפור ודיווח על באגים») лежало в
--    группе «ללא תחום» внизу экрана — для модуля «feedback» не было узла.
--    Заводим обычный корневой раздел «הערות צוות» и кладём право туда.
--    Цвет задан явно: у модуля feedback своего цвета в теме нет.
--
-- 2. «בירור יהדות — בדיקה ראשונית» и «בירור יהדות — אישור סופי» (коды
--    studies.jewishness_initial_check / jewishness_final_approve) лежали в
--    разделе «לימודים». Переносим их в раздел «בירור יהדות».
--
-- Меняется ТОЛЬКО показ: проверки доступа эти таблицы не читают, коды прав
-- не меняются, у кого право было — у того и осталось.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Раздел «הערות צוות» ─────────────────────────────────────────────────
INSERT INTO security_tree_nodes (
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  module_code, color, sort_order
)
SELECT
  'הערות צוות', 'Замечания сотрудников', 'Staff feedback',
  'הכפתור "הצעה לשיפור או באג" בראש האתר: מי יכול לשלוח הערות לבעל המערכת.',
  'Кнопка «Предложение или ошибка» в шапке: кто может отправлять замечания владельцу системы.',
  'The "Suggestion or bug" button in the header: who can send notes to the system owner.',
  'feedback', 'var(--accent)', 0
WHERE NOT EXISTS (
  SELECT 1 FROM security_tree_nodes WHERE module_code = 'feedback' AND parent_id IS NULL
);

INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = 'feedback' AND n.parent_id IS NULL
 WHERE mp.module = 'feedback'
ON CONFLICT (module, privilege_code) DO UPDATE SET node_id = EXCLUDED.node_id;

-- ── 2. Две проверки еврейства — в раздел «בירור יהדות» ──────────────────────
UPDATE security_tree_items i
   SET node_id = n.id
  FROM security_tree_nodes n
 WHERE n.module_code = 'jewishness' AND n.parent_id IS NULL
   AND i.module = 'studies'
   AND i.privilege_code IN ('jewishness_initial_check', 'jewishness_final_approve')
   AND i.node_id <> n.id;

-- Самопроверка: оба переноса на месте.
DO $$
DECLARE in_feedback INT; in_jewishness INT;
BEGIN
  SELECT count(*) INTO in_feedback
    FROM security_tree_items i
    JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = 'feedback' AND i.module = 'feedback' AND i.privilege_code = 'submit';

  SELECT count(*) INTO in_jewishness
    FROM security_tree_items i
    JOIN security_tree_nodes n ON n.id = i.node_id
   WHERE n.module_code = 'jewishness'
     AND i.module = 'studies'
     AND i.privilege_code IN ('jewishness_initial_check', 'jewishness_final_approve');

  IF in_feedback <> 1 OR in_jewishness <> 2 THEN
    RAISE EXCEPTION 'Перенос не удался: в «הערות צוות» % из 1, в «בירור יהדות» % из 2.',
      in_feedback, in_jewishness;
  END IF;
END $$;
