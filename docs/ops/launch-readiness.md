# מוכנות להשקה — נהלי תפעול (Ops)

מסמך תפעולי לצוות. מכסה: אימות מיגרציות, משתני סביבה, ניטור שגיאות (Sentry),
גיבויים ושחזור, ובדיקת ה-Storage bucket. חלק מהצעדים דורשים גישה ל-Supabase /
Vercel Dashboard ומבוצעים ידנית.

---

## 1. אימות מיגרציות (Workstream 1a) ✅

הכלי: `scripts/verify-migrations.mjs` מנגן את כל המיגרציות ומפיק שאילתת SQL.

```bash
node scripts/verify-migrations.mjs > verify.sql
```

מריצים את `verify.sql` ב-**Supabase Dashboard → SQL Editor**. תוצאה ריקה = כל
המיגרציות הוחלו. שורות = אובייקטים חסרים (מיגרציה שלא רצה).

> נכון לאימות האחרון: כל המיגרציות מאומתות כמוחלות (אחרי הוספת שתי העמודות
> `departments.sort_order` + `departments.description` ממיגרציה `20260504120000`).

---

## 2. משתני סביבה (Workstream 1d)

הכלי: `scripts/check-env.mjs` — מריצים **בסביבה שבודקים** (מקומית עם משתני
הפרודקשן, או כשלב לפני דיפלוי). מחזיר קוד יציאה 1 אם חסר משהו חובה.

```bash
node scripts/check-env.mjs
```

| משתנה | חובה? | הערה |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **חובה** | כתובת פרויקט Supabase |
| `SUPABASE_SECRET_KEY` | **חובה** | service_role key (השרת חייב לרוץ תחתיו) |
| `JWT_SECRET` | **חובה** | ≥32 תווים; בפרודקשן האפליקציה **קורסת בכוונה** אם חסר/חלש (fail-closed) |
| `CRON_SECRET` | מומלץ | מגן על `/api/cron/*` — בלעדיו ה-endpoint פתוח |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | אופציונלי | ניטור שגיאות (ראה סעיף 3) |

**יצירת JWT_SECRET חזק:**
```bash
openssl rand -base64 48
```

את כל המשתנים מגדירים ב-**Vercel → Project → Settings → Environment Variables**
(ל-Production ול-Preview בנפרד). סודות **אך ורק** ב-env — לא ב-git.

---

## 3. ניטור שגיאות — Sentry (Workstream 1b)

הקוד כבר מוטמע (`sentry.*.config.ts`, `instrumentation.ts`, `app/global-error.tsx`,
עטיפת `next.config.js`). **בלי DSN הכל כבוי (no-op)** — צריך רק להגדיר את ה-env.

צעדים חד-פעמיים (בעל המערכת):
1. https://sentry.io → New Project → Platform: **Next.js**.
2. להעתיק את ה-**DSN** (מ-Project Settings → Client Keys).
3. ב-Vercel להגדיר:
   - `NEXT_PUBLIC_SENTRY_DSN` = ה-DSN (שגיאות לקוח)
   - `SENTRY_DSN` = אותו DSN (שגיאות שרת)
   - `NEXT_PUBLIC_SENTRY_ENV` = `production`
   - *(אופציונלי, ל-source maps)* `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
4. דיפלוי מחדש. בדיקה: לזרוק שגיאת בדיקה (עמוד לא קיים / כפתור בדיקה) ולוודא
   שהיא מופיעה ב-Sentry.

הגדרות ברירת מחדל: `sendDefaultPii: false` (אין מיילים/טלפונים של לידים
בטרייסים), Session Replay כבוי.

---

## 4. גיבויים ושחזור (Workstream 1c)

### אישור שגיבויים יומיים פעילים
**Supabase Dashboard → Database → Backups**:
- בתכנית **Pro** יש גיבוי יומי אוטומטי + PITR (Point-in-Time Recovery). לוודא
  שהם מופעלים ושמופיע גיבוי מהיממה האחרונה.
- בתכנית **Free** אין גיבוי אוטומטי מנוהל — יש לתזמן `pg_dump` ידני (ראה למטה)
  או לשדרג ל-Pro לפני השקה. **מומלץ Pro לפרודקשן.**

### נוהל גיבוי ידני (גם כגיבוי-על וגם למעבר בין סביבות)
```bash
# צריך את ה-connection string מ-Supabase → Project Settings → Database
pg_dump "$SUPABASE_DB_URL" -Fc -f backup_$(date +%Y%m%d).dump
```

### נוהל שחזור — לבדוק על **staging** לפני שסומכים עליו
1. ליצור/לבחור פרויקט **staging** ב-Supabase.
2. לשחזר לתוכו:
   ```bash
   pg_restore --clean --if-exists -d "$STAGING_DB_URL" backup_YYYYMMDD.dump
   ```
3. להריץ את `verify-migrations.sql` (סעיף 1) על ה-staging המשוחזר → תוצאה ריקה.
4. להעלות את האפליקציה מול ה-staging ולוודא התחברות + טעינת רשימות.

> ⚠️ יש **לבצע** שחזור-בדיקה אחד לפני ההשקה — גיבוי שלא נבדק אינו גיבוי.
> זהו צעד ידני (דורש connection strings) שבעל המערכת מריץ.

---

## 5. Storage bucket פרטי (Workstream 1d)

מסמכים/חתימות נשמרים ב-bucket פרטי בשם `documents`. לוודא שהוא קיים ו**לא ציבורי**:

```sql
-- ב-Supabase SQL Editor:
select id, public from storage.buckets where id = 'documents';
-- ציפייה: שורה אחת, public = false
```

אם חסר — ליצור ב-**Storage → New bucket**, שם `documents`, **Private**.

---

## סיכום — מה בעל המערכת צריך לבצע ידנית

- [ ] סעיף 1: הרצת `verify-migrations.sql` → ריק. *(בוצע ✅)*
- [ ] סעיף 2: הגדרת משתני החובה ב-Vercel; הרצת `check-env.mjs` → ירוק.
- [ ] סעיף 3: יצירת פרויקט Sentry + הגדרת DSN ב-Vercel + בדיקת שגיאה.
- [ ] סעיף 4: אישור גיבוי יומי + **ביצוע שחזור-בדיקה אחד** על staging.
- [ ] סעיף 5: אימות שה-bucket `documents` קיים ופרטי.
