<div dir="rtl">

# הפעלת מודל הלימודים החדש — SQL להרצה

מודל הלימודים החדש (מבנה → שנה → מחזור → סמסטר → קורס → שיעור) בנוי בקוד
בצורה **deploy-safe**: הכול עובד גם לפני הרצת ה-SQL, פשוט השדות החדשים לא
פעילים (שנה/מחזור מקובצים תחת «ללא שנה», קורסים ובניינים ריקים).

כדי להפעיל את השדות החדשים — הרץ את ה-SQL הבא **פעם אחת** ב-Supabase
(Dashboard ← SQL Editor). הוא **אדיטיבי ואידמפוטני** (`IF NOT EXISTS`) — בטוח
להריץ גם אם חלק כבר קיים, ולא מוחק שום דבר.

## מה ה-SQL עושה

| שינוי | לְמה |
|------|------|
| `class_groups.year_level` | השנה (א/ב/ג/ד) של הסמסטר |
| `class_groups.parent_semester_id` | קישור קורס → סמסטר-אב |
| טבלת `buildings` + `rooms` | בניינים וכיתות לבחירה במערכת השעות |
| `class_schedule_slots.building_id` / `room_id` | שיוך משבצת לבניין/כיתה |
| `class_schedule_slots.is_kodesh_block` | סימון בלוק יהדות |

## ה-SQL

```sql
-- 1. «שנה» (א/ב/ג/ד) על הסמסטר. השנה העברית (מחזור) יושבת ב-year_label הקיים.
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS year_level INTEGER;

-- 2. קורס שייך לסמסטר-אב.
ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS parent_semester_id UUID
  REFERENCES class_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_class_groups_parent_semester
  ON class_groups(parent_semester_id);

-- 3. בניינים וכיתות.
CREATE TABLE IF NOT EXISTS buildings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text,
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name         text NOT NULL,
  capacity     integer,
  sort_order   integer DEFAULT 0,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);

-- 4. שיוך משבצת לבניין/כיתה (הטקסט החופשי room נשאר לתאימות).
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS building_id UUID
  REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS room_id UUID
  REFERENCES rooms(id) ON DELETE SET NULL;

-- 5. סימון בלוק יהדות על משבצת.
ALTER TABLE class_schedule_slots ADD COLUMN IF NOT EXISTS is_kodesh_block BOOLEAN DEFAULT false;
```

(אותו תוכן נמצא גם בקובץ `supabase/migrations/20260721120000_studies_drilldown.sql`.)

## בדיקה שהכול עבר

הרץ אחרי כן — צריך להחזיר 6 שורות:

```sql
SELECT 'year_level' AS item WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='class_groups' AND column_name='year_level')
UNION ALL SELECT 'parent_semester_id' WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='class_groups' AND column_name='parent_semester_id')
UNION ALL SELECT 'buildings' WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='buildings')
UNION ALL SELECT 'rooms' WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='rooms')
UNION ALL SELECT 'slot.building_id' WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='class_schedule_slots' AND column_name='building_id')
UNION ALL SELECT 'slot.is_kodesh_block' WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='class_schedule_slots' AND column_name='is_kodesh_block');
```

## אחרי ההרצה — איך זה עובד במסך

1. **חינוך ← לימודים ← סמסטרים** — כאן נכנס מרחב ה-drill-down: מבנה → שנה →
   מחזור → סמסטרים.
2. **יצירת סמסטר** — מלא «שנה (א/ב/ג)» + «שנה עברית (מחזור)» (למשל תשפ״ז); הם
   קובעים לאן הסמסטר ייכנס בעץ.
3. **פתיחת סמסטר** → הקורסים שלו. «קורס חדש» = מורה + מקצוע + תלמידות (מתוך
   רוסטר הסמסטר). «פתח קורס» → כרטיס הקבוצה (מערכת/שיעורים/ציונים).
4. **בניינים** (בלשונית «מתקדם») — הגדר בניינים וכיתות; בטופס המשבצת אפשר לבחור
   אותם.
5. **יהדות** — אם קורס רגיל מקבל משבצת בשעות 09:15/11:00 (ב׳–ה׳) תופיע אזהרה.
6. **קידום מחזור** — במסך התלמידות: «בחירה מרובה» → «קדם שנה +1».

</div>
