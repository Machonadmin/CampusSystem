# מיגרציה: אישור שיבוץ בזמן קודש

**קובץ המיגרציה:** `supabase/migrations/20260826140000_schedule_slot_approval.sql`

## מה זה עושה
מוסיף לטבלת `class_schedule_slots` מנגנון אישור לשיבוצי חול שנופלים בזמן הקודש:
- `approval_status` — `active` (ברירת מחדל) / `pending` / `rejected`
- `requested_by`, `approved_by`, `decided_at`

מנהל לימודי חול שמשבץ שיעור בזמן קודש → הסלוט נכנס כ‑`pending`, **לא מייצר שיעורים**
ולא מופיע כפעיל עד שהמנהל הכללי (superadmin) מאשר. אישור → `active`, דחייה → `rejected`.
שיבוץ מחוץ לזמן קודש, או שיבוץ של המנהל הכללי עצמו → `active` מיד.

הקוד **בטוח לפריסה**: עד שהמיגרציה מוחלת, המערכת מתנהגת כמו קודם (בלי העמודה →
כל סלוט נחשב `active`, והתראת הקודש נשארת רכה).

## איך להחיל (Supabase Dashboard → SQL Editor)
להדביק ולהריץ את הבלוק הבא (זהה לקובץ המיגרציה, אידמפוטנטי — בטוח להריץ שוב):

```sql
ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'active';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_schedule_slots_approval_status_chk'
  ) THEN
    ALTER TABLE class_schedule_slots
      ADD CONSTRAINT class_schedule_slots_approval_status_chk
      CHECK (approval_status IN ('active', 'pending', 'rejected'));
  END IF;
END $$;

ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_class_schedule_slots_pending
  ON class_schedule_slots (approval_status)
  WHERE approval_status = 'pending';
```

## אחרי ההחלה
- שיבוץ חול בזמן קודש ייכנס כ"ממתין לאישור" (מסומן ברשת), ולא ייצר שיעורים.
- למנהל הכללי תופיע בכותרת מודול הלימודים הקישורית **"אישורי שיבוץ"** עם מונה
  בקשות, ובה כפתורי אישור/דחייה.
