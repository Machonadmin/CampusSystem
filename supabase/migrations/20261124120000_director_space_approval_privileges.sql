-- ═════════════════════════════════════════════════════════════════════
-- «מרחב המנהל», шаг 3: узкие права ТОЛЬКО на утверждение.
-- Решение владельца 2026-11-24 («הרשאות צרות»).
--
-- המנהל открывает своему секретарю утверждение по категориям прямо в
-- «מרחב המנהל». Переключатель выдаёт личную строку person_privileges — ту же,
-- что пишет экран «אבטחת מידע» (там её видно и там же можно снять). Чтобы
-- секретарь получал ТОЛЬКО утверждение, а не широкие права:
--   1. studies.approve_schedule_slots   — «אישור שעות במערכת» (новое).
--      Раньше новый час на время кодеш утверждал ТОЛЬКО superadmin.
--   2. studies.approve_teacher_attendance — «אישור נוכחות מורים» (новое).
--      Раньше утверждение требовало manage_students («ניהול תיק תלמידה»).
--   3. finance.confirm_payment — «אימות תשלום»: право было в каталоге, но не
--      подключено ни к одному экрану (is_legacy). Теперь оно открывает ТОЛЬКО
--      подтверждение платежа (POST /api/finance/payments/[id]/approve) — без
--      расчётных листков и без доступа к финансам, которые даёт approve_payment.
--
-- По умолчанию новых прав нет НИ У КОГО: эта миграция не создаёт строк в
-- role_privileges/person_privileges. Кто утверждал раньше (superadmin,
-- manage_students, approve_payment) — утверждает и дальше.
--
-- Идемпотентно. Применять ВРУЧНУЮ через Supabase Dashboard SQL Editor.
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. Два новых права в каталоге (раздел «לימודים») ─────────────────────────
INSERT INTO module_privileges (
  module, privilege_code, privilege_name, sort_order,
  name_he, name_ru, name_en,
  description_he, description_ru, description_en,
  level, risk, allowed_scopes
) VALUES
  ('studies', 'approve_schedule_slots', 'Утверждение часов в расписании', 307,
   'אישור שעות במערכת',
   'Утверждение часов в расписании',
   'Approve timetable slots',
   'אישור או דחייה של שעה חדשה שהתבקשה במערכת השעות על זמן לימודי היהדות. ההרשאה נותנת רק את האישור הזה ולא שום דבר אחר. המנהל פותח אותה למזכירה ב"מרחב המנהל".',
   'Утверждение или отклонение нового часа, запрошенного в расписании на время иудаики. Право открывает только это утверждение и ничего больше. Директор открывает его секретарю в «Пространстве директора».',
   'Approve or reject a new timetable slot requested during Judaic studies time. Grants only this approval and nothing else. The director opens it to the secretary in the Director space.',
   'manage', 'normal', ARRAY['all']),
  ('studies', 'approve_teacher_attendance', 'Утверждение присутствия преподавателей', 308,
   'אישור נוכחות מורים',
   'Утверждение присутствия преподавателей',
   'Approve teacher attendance',
   'אישור או דחייה של דיווחי נוכחות של מורים. ההרשאה נותנת רק את האישור הזה, בלי עריכת תיק תלמידה. המנהל פותח אותה למזכירה ב"מרחב המנהל".',
   'Утверждение или отклонение отметок присутствия преподавателей. Право открывает только это утверждение, без редактирования дела студентки. Директор открывает его секретарю в «Пространстве директора».',
   'Approve or reject teacher attendance reports. Grants only this approval, without editing student files. The director opens it to the secretary in the Director space.',
   'manage', 'normal', ARRAY['all','department'])
ON CONFLICT (module, privilege_code) DO NOTHING;

-- ── 2. «אימות תשלום» теперь подключено ──────────────────────────────────────
UPDATE module_privileges SET
  is_legacy = false,
  description_he = 'אישור תשלום שהתקבל, ורק זה: בלי תלושי שכר ובלי גישה לכספי התלמידות. המנהל פותח אותה למזכירה ב"מרחב המנהל".',
  description_ru = 'Подтверждение полученного платежа, и только это: без расчётных листков и без доступа к финансам студенток. Директор открывает его секретарю в «Пространстве директора».',
  description_en = 'Confirms a received payment and nothing else: no payslips and no access to student finances. The director opens it to the secretary in the Director space.'
WHERE module = 'finance' AND privilege_code = 'confirm_payment';

-- ── 3. Новые права — в разделе «לימודים» на экране «אבטחת מידע» ──────────────
INSERT INTO security_tree_items (node_id, module, privilege_code, sort_order)
SELECT n.id, mp.module, mp.privilege_code, COALESCE(mp.sort_order, 0)
  FROM module_privileges mp
  JOIN security_tree_nodes n ON n.module_code = 'studies' AND n.parent_id IS NULL
 WHERE mp.module = 'studies'
   AND mp.privilege_code IN ('approve_schedule_slots', 'approve_teacher_attendance')
ON CONFLICT (module, privilege_code) DO NOTHING;

-- Самопроверка.
DO $$
DECLARE in_catalog INT; in_tree INT; legacy BOOLEAN;
BEGIN
  SELECT count(*) INTO in_catalog FROM module_privileges
   WHERE module = 'studies' AND privilege_code IN ('approve_schedule_slots', 'approve_teacher_attendance');
  SELECT count(*) INTO in_tree FROM security_tree_items
   WHERE module = 'studies' AND privilege_code IN ('approve_schedule_slots', 'approve_teacher_attendance');
  SELECT is_legacy INTO legacy FROM module_privileges WHERE module = 'finance' AND privilege_code = 'confirm_payment';
  IF in_catalog <> 2 OR in_tree <> 2 OR legacy IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Права «מרחב המנהל» не на месте: в каталоге %, в дереве %, confirm_payment.is_legacy = %', in_catalog, in_tree, legacy;
  END IF;
END $$;

SELECT module, privilege_code, name_he, is_legacy
  FROM module_privileges
 WHERE (module, privilege_code) IN (('studies','approve_schedule_slots'), ('studies','approve_teacher_attendance'), ('finance','confirm_payment'));
