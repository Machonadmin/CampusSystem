-- ═════════════════════════════════════════════════════════════════════
-- S9 (решение владельца 08.10.2026): три права раздела «הגדרות», которые
-- не проверяет ни один экран и ни один API (поиск по app/ и lib/):
--   settings.manage_roles       «ניהול תפקידים והרשאות»
--   settings.manage_departments «ניהול המבנה הארגוני»
--   settings.manage_system      «הגדרות מערכת»
-- Редактор шаблонов процессов требует супер-админа; подразделения
-- управляются через data_security.manage_units; экран «תפקידים והרשאות» убран.
--
-- Помечаем их как старые (is_legacy) — так же, как L08 в
-- 20261008120000_wording_privileges_and_units.sql: экран прячет их за
-- «הצג», а объяснение прямо говорит, что выдача ничего не меняет.
-- Сами права и уже выданные гранты НЕ удаляются.
--
-- Идемпотентно: UPDATE по ключу.
-- ═════════════════════════════════════════════════════════════════════

UPDATE module_privileges SET
  is_legacy = true,
  description_he = 'ההרשאה לא מחוברת לשום מסך — הענקתה לא משנה דבר.',
  description_ru = 'Право не подключено ни к одному экрану — его выдача ничего не меняет.',
  description_en = 'Not connected to any screen — granting it changes nothing.'
WHERE (module, privilege_code) IN (
  ('settings', 'manage_roles'),
  ('settings', 'manage_departments')
);

UPDATE module_privileges SET
  is_legacy = true,
  description_he = 'ההרשאה לא מחוברת לשום מסך — הענקתה לא משנה דבר. עריכת תבניות תהליכים דורשת מנהל על.',
  description_ru = 'Право не подключено ни к одному экрану — его выдача ничего не меняет. Шаблоны процессов редактирует только супер-админ.',
  description_en = 'Not connected to any screen — granting it changes nothing. Editing process templates requires a superadmin.'
WHERE module = 'settings' AND privilege_code = 'manage_system';
