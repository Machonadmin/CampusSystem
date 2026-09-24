-- ═════════════════════════════════════════════════════════════════════
-- כיווני לימוד ורמות — תמיכה תלת-לשונית.
--
-- reference_directions / reference_levels החזיקו רק name_ru. מוסיפים name_he
-- ו-name_en (כמו ב-departments: name_ru הוא ברירת המחדל, he/en אם הוזנו).
-- התצוגה בוחרת לפי שפת המשתמש עם נפילה ל-name_ru. אדיטיבי, deploy-safe.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE reference_directions ADD COLUMN IF NOT EXISTS name_he text;
ALTER TABLE reference_directions ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE reference_levels     ADD COLUMN IF NOT EXISTS name_he text;
ALTER TABLE reference_levels     ADD COLUMN IF NOT EXISTS name_en text;
