# מכון חמ״ש — תמונת מצב מלאה של מערכת הניהול

**תאריך הסריקה:** 4 בספטמבר 2026
**Commit שנסרק:** `9e9f61ccbafdf725b2b9f2ca4fb2680d435cece0` (ענף `main`; ענף העבודה `claude/hamesh-system-audit-ji2e12` זהה לו בדיוק)
**מקור:** `Machonadmin/CampusSystem` — הריפו שממנו Vercel מפרסם לפרודקשן.

> **כיצד נכתב הדוח:** נסרקו בפועל הקוד, בסיס הנתונים (169 קבצי מיגרציה), כל ה-routes וה-APIs,
> כל המסכים, מודל ההרשאות, הטסטים והקונפיגורציה. **לא בוצע שינוי קוד כלשהו.**
> כל טענה בדוח מלווה בהפניה לקובץ/טבלה/route שממנו היא נלמדה. במקומות שבהם אי אפשר
> לדעת מהקוד (למשל: אילו נתונים באמת קיימים בבסיס הנתונים החי, או האם מיגרציה מסוימת
> הורצה בפועל ב-Supabase) — נכתב זאת במפורש.

---

## 1. תקציר מנהלים

### מה נבנה
נבנתה **מערכת ניהול מוסדית שלמה** (ERP חינוכי) עבור מכון חמ״ש — לא אתר ולא טופס, אלא מערכת
שמנהלת את כל מחזור החיים של אדם מול המכון: מרגע שהוא ליד ועד היותו בוגר או עובד, כולל
לימודים, פנימייה, בריאות, כספים, משימות, מסמכים והרשאות.

### היקף המערכת כיום (מספרים עובדתיים מהקוד)
| מדד | כמות |
|---|---|
| מסכים (`page.tsx`) | 88 |
| נקודות API (`route.ts`) | 336 |
| מיגרציות בסיס נתונים | 169 קבצים, ~13,200 שורות SQL |
| טבלאות שנוצרו במיגרציות | ~128 |
| פונקציות DB (RPC) | 20 |
| שורות קוד TypeScript/TSX | ~120,000 |
| טסטים אוטומטיים | 779 טסטים ב-69 קבצים — **כולם עוברים** |
| מפתחות תרגום | 4,649 × 3 שפות (he / ru / en) — זהות מלאה |
| רכיבי UI משותפים | 73 |

### עולמות העבודה המרכזיים שכבר קיימים
1. **אנשים** — מאגר אנשים מרכזי אחד (`persons`) + זיהוי כפילויות + מיזוג רשומות.
2. **גיוס וקבלה** — טופס ציבורי → ליד → תהליך גיוס → ועדת קבלה רב-שלבית עם חתימות דיגיטליות → תלמידה.
3. **לימודים** — יחידות, מסלולים, שנים, סמסטרים, קורסים, מורים, כיתות, מערכת שעות, שיעורים, נוכחות, ציונים.
4. **מחלקת יהדות (קודש)** — רמות, קורסים, מכסות שעות למורה, אישורי מורים, בירור יהדות דו-שלבי, לוח שנה אקדמי עם סוגי ימים.
5. **תיק תלמידה** — 14 פאנלים בכרטיס אחד (לימודים, חיי קמפוס, ניהול וכספים).
6. **פנימייה, מטבח, אחזקה, ביטחון** — כל אחד מודול עצמאי מלא.
7. **רפואה ופסיכולוגיה** — מודולים נפרדים עם תיקים, ביקורים/פגישות והפניות.
8. **כספים** — שכר לימוד לפי סמסטר, הנחות עם חתימה, תשלומים, יתרות + **שכר עובדים** (payslips).
9. **משימות, יומן, מסמכים, התראות, דוחות** — תשתיות רוחביות.
10. **הרשאות** — מודל תפקידים/הרשאות/scope מלא, נאכף בצד השרת.
11. **פורטל תלמידה** — כניסה נפרדת לתלמידה עם 8 פאנלים אישיים.

### מה כבר עובד בפועל
- **הבנייה עוברת מקצה לקצה**: `tsc` — 0 שגיאות · `lint` — 0 שגיאות · 779 טסטים עוברים · `next build` מצליח.
- **האימות והרשאות עובדים**: כניסה, JWT, תפקידים, חסימת מודולים ב-middleware, "צפייה כמשתמש" (impersonation) במצב קריאה בלבד.
- **תהליך הגיוס והקבלה עובד מקצה לקצה** בקוד: יצירת ליד → תהליך "גיוס" נפתח אוטומטית → העברה לוועדה → 4 שלבי קבלה עם חתימות → הפיכה לתלמידה.
- **ניהול הלימודים עובד**: יצירת קבוצות/קורסים, שיבוץ מורים, בניית מערכת שעות, ייצור שיעורים אוטומטי (cron לילי), רישום נוכחות, ציונים.
- **כספים עובדים**: הגדרת סמסטר ומחיר, חיוב תלמידה, הנחה עם חתימה, תשלום, יתרה, קבלה.

### יכולות משמעותיות שקיימות בקוד אך עדיין לא מונגשות במלואן
(פירוט מלא בסעיף 22)
- **מסלול ביקורת (audit log)** — טריגרים ב-DB מתעדים כל שינוי ב-8 טבלאות רגישות, **אבל אין שום מסך או API שקורא אותם**.
- **שכר עובדים ותלושי שכר** — מודול שלם (תעריפים, רישומי עבודה, יצירה אוטומטית מהשיעורים, תלוש) הקיים ב-API וב-UI תחת `/dashboard/finance/staff`, שלא הוזכר בשום מקום בתפריט הראשי.
- **פוש-נוטיפיקציות לנייד (PWA)** — מיושם במלואו (VAPID, service worker, מנוי, שליחה) ומחובר למנגנון ההתראות.
- **פיד יומן חיצוני (ICS)** — כל עובד יכול לחבר את יומן המערכת ל-Google Calendar.
- **ייבוא תלמידות מ-CSV**, **מעבר שנה אקדמית אוטומטי**, **סקרי הוראה**, **בקרת איכות**, **מנוע workflow גנרי שניתן לעריכה מה-UI**.

### מה לא קיים בכלל (חשוב לדעת)
- **חוב אקדמי** — אין ישות כזו במערכת (סעיף 8).
- **כרטיסי כניסה / בקרת גישה פיזית** — אין שום קוד (סעיף 15).
- **תיק עובד מובנה** (קורות חיים, דיפלומות, המלצות כקבצים) — הטופס אוסף את השדות אך שומר אותם כטקסט JSON בשדה הערות, בלי קבצים (סעיף 6).
- **מייל / SMS יוצא** — אין שום ספק חיצוני מחובר (סעיף 18).

*(לפי בקשתך, לא ניתן ציון כללי או אחוז מוכנות.)*

---

## 2. מפת המערכת המלאה

להלן כל המודולים והאזורים הקיימים בפרויקט. הסימון בטור "מצב" מוסבר בסעיף 23.

### 2.1 בית ומסכים רוחביים

| מודול | מטרה | מה נבנה | Routes | מה עובד מקצה לקצה | מה חסר |
|---|---|---|---|---|---|
| **בית / Dashboard** | מסך פתיחה עם רשת מודולים, "סדר יום" ווידג'טים | `app/dashboard/page.tsx` (321 שורות) + `HomeWidgets` + `HomeAgenda` | `/dashboard` | תצוגת המודולים שהמשתמש מורשה להם, יומן היום, משימות | — |
| **יומן** | יומן אישי מאחד | `app/dashboard/calendar/` (2,139 שורות, 8 קבצים) | `/dashboard/calendar` | פגישות, ימי חסימה, אירועים אישיים, שיעורים, מערכת שעות, משימות, ימי הולדת, תאריך עברי, קישור ל-Google Calendar | סנכרון דו-כיווני עם Google |
| **משימות** | מערכת משימות כלל-מוסדית | `app/dashboard/tasks/` + 9 APIs | `/dashboard/tasks`, `/dashboard/tasks/[id]` | יצירה, הקצאה (אדם/מחלקה/תפקיד/פול), סטטוסים, תגובות, צופים, היסטוריה, חזרתיות | ראה סעיף 10 |
| **חיפוש גלובלי** | חיפוש רוחבי | `components/dashboard/GlobalSearch.tsx` + `/api/search` | בשורת הכותרת | חיפוש אנשים/תלמידות/משימות | — |
| **התראות** | פעמון + פוש | `NotificationBell` + `/api/notifications` + `lib/push/` | בשורת הכותרת | התראות פנימיות + פוש אמיתי לנייד | ראה 22 |
| **הגדרות** | ניהול מערכת | 6 מסכים | `/dashboard/settings/{roles,users,positions,reference-cities,workflows}` | עריכת תפקידים והרשאות, ניהול משתמשים, עורך תהליכי workflow | אין מסך לצפייה ב-audit log |

### 2.2 אנשים וצוות

| מודול | מטרה | מה נבנה | Routes | מצב |
|---|---|---|---|---|
| **אנשים** | ספריית אנשים קריאה | `/api/persons/*` (10 routes) | `/dashboard/persons`, `/dashboard/persons/[id]` | עובד. כולל **גילוי כפילויות** (`/api/persons/duplicates`) ו**מיזוג רשומות** (`/api/persons/merge` → RPC `merge_persons`) |
| **צוות (HR)** | קליטת עובד וניהול משרות | `app/dashboard/staff/page.tsx` (1,044 שורות) + `AddEmployeeModal` + `/api/staff/*` (7 routes) | `/dashboard/staff` | עובד לקליטה, משרות, מחלקות, סיום העסקה, בדיקת כפילות בעת יצירה, "תצוגה מקדימה של scope" | שדות התיק העשירים לא נשמרים במבנה — סעיף 6 |
| **אנשי קשר** | ספריית ארגונים/גורמים חיצוניים | טבלת `contacts` + `/api/contacts/*` | `/dashboard/contacts` | עובד | **לא מקושר ל-`persons`** — סעיף 3 |
| **בוגרות** | פרופיל בוגרת | `alumni_profiles` + `/api/alumni/*` | `/dashboard/alumni`, `/dashboard/alumni/[id]` | נוצר אוטומטית בעת "בוגרת" (RPC `transition_education_status`) | — |
| **תורמים** | תורמים ותרומות | `sponsors`, `donations` | `/dashboard/sponsors`, `/dashboard/sponsors/[id]` | עובד: רשימה, תרומות, סטטוס (הובטח/התקבל/בוטל), סנכרון לאנשי קשר | — |

### 2.3 גיוס, קבלה ולימודים

| מודול | Routes עיקריים | מה עובד |
|---|---|---|
| **מרכז החינוך (hub)** | `/dashboard/education` | מפנה אוטומטית אם יש גישה לסעיף אחד; מציג בורר אם יש 2+ (`lib/education/education-hub.ts`) |
| **גיוס** | `/dashboard/education/recruitment`, `.../leads/[id]`, `.../recruitment-form`, `.../recruitment-report` | רשימת לידים, כרטיס ליד, טופס גיוס הניתן להגדרה, דוח גיוס, "העברה לוועדת קבלה" |
| **ועדת קבלה** | `/dashboard/education/admission` | לוח ועדה, סקירת שלבים, מי חתם ומי לא, יעדים תקועים |
| **לימודים** | `/dashboard/education/studies` (drill-down ב-URL) | מסלול → שנה → מחזור → סמסטר → קורסים; לוח מחוונים, פעולות, תלמידות, הגדרות |
| **קודש / יהדות** | `/dashboard/education/kodesh`, `kodesh-home`, `kodesh-courses`, `kodesh-rav` | הכנת סמסטר, ניהול רמות וקורסים, מסך הרב (אישור מורות, מכסות) |
| **מערכת שעות** | `/dashboard/education/timetable`, `.../schedule-approvals` | סידור שיבוצים, זיהוי התנגשויות, אישור שיבוץ בזמן קודש ע״י מנהל כללי |
| **נוכחות והיעדרויות** | `/dashboard/education/absences`, `.../teacher-attendance` | מקרי היעדרות עם העברה למחלקה אחרת; נוכחות מורים |
| **התראות תלמידה** | `/dashboard/education/alerts` | התראות פר-תלמידה עם סוגי התראה הניתנים לעריכה + דגל "רגיש" |
| **מבנה ארגוני-לימודי** | `/dashboard/education/structure`, `.../units`, `.../tracks`, `.../subjects`, `.../class-groups/[id]` | עורך מבנה עם היררכיה חופשית, יחידות, מסלולים, מקצועות, קבוצות |
| **חברותא** | `/dashboard/chavruta`, `/dashboard/education/chavruta` | שיוך מורה↔תלמידה, מפגשים, סיכומים |
| **סקרי הוראה** | `/dashboard/education/teaching-surveys` | בניית סקר, פתיחה/סגירה, תוצאות לפי מורה |
| **ייבוא תלמידות** | `/dashboard/education/students/import` | ייבוא CSV עם מיפוי עמודות |
| **מעבר שנה** | טאב בתוך `studies` → `YearRolloverTab` | RPC `advance_academic_year` — קידום שנה + סימון בוגרות |

### 2.4 רווחה, פנימייה ותפעול

| מודול | טבלאות | Routes | מצב |
|---|---|---|---|
| **פנימייה** | `dorm_buildings`, `dorm_rooms`, `dorm_assignments` | `/dashboard/dormitory`, `/dashboard/dormitory/[id]` | בניינים, חדרים, קיבולת, שיבוץ תלמידה, תפוסה |
| **מטבח/מזון** | `meal_plans`, `meal_enrollments`, `dietary_profiles` | `/dashboard/food`, `/dashboard/food/[id]` | תוכניות ארוחה, רישום תלמידות, פרופיל תזונתי |
| **אחזקה** | `maintenance_requests` | `/dashboard/maintenance`, `.../[id]` | קריאות שירות, קטגוריה, דחיפות, סטטוס, שיוך |
| **ביטחון** | `security_incidents` | `/dashboard/security`, `.../[id]` | יומן אירועי ביטחון, סטטיסטיקות |
| **רופאה** | `medical_profiles`, `medical_visits` | `/dashboard/doctor`, `.../[id]` | תיק רפואי, ביקורים, הפניות, מעקב |
| **פסיכולוגית** | `psych_profiles`, `psych_sessions` | `/dashboard/psychologist`, `.../[id]` | תיק ליווי, פגישות, רמת סיכון, מעקב |
| **בריאות (מאוחד)** | — | `/dashboard/health` | כניסה מאוחדת לרופאה+פסיכולוגית |
| **בקרת איכות** | `quality_check_templates`, `quality_checks` | `/dashboard/quality-control`, `.../[id]` | תבניות בדיקה עם בלוקים ושאלות, ביצוע בדיקה |

### 2.5 כספים

| מודול | Routes | מצב |
|---|---|---|
| **שכר לימוד** | `/dashboard/finance`, `/dashboard/finance/[id]`, `.../semesters`, `.../receipt/[paymentId]`, `.../access` | סמסטרים ומחירים, חיובים, הנחות בחתימה, תשלומים, יתרות, קבלה, ניהול גישה נקודתית |
| **שכר עובדים** | `/dashboard/finance/staff`, `.../staff/[personId]`, `.../staff/chavruta` | תעריפים אישיים, רישומי עבודה, יצירה אוטומטית מהשיעורים, שבתות, תלוש חודשי |
| **הגדרות כספים** | `/api/finance/settings` | מחיר ברירת מחדל לשנה/סמסטר, מטבע, אחוז הנחה ברירת מחדל |
| **אישורי הנחה** | `/api/finance/discount-approvals` | טבלת governance לאישור הנחה פר-תלמידה — **טרם משויכת לתפקיד** |

### 2.6 פורטל תלמידה
`/portal` (כניסה נפרדת ב-`/portal/login`, טבלת `student_credentials` נפרדת מ-`person_accounts`).
8 פאנלים: הודעות, לוח מחוונים, יומן, ציונים, חברותא, שבתות, סקר הוראה, פגישות.

---

## 3. אנשי קשר והישות המרכזית של אדם

### 3.1 האם יש רשומת Person מרכזית אחת? — **כן.**
הטבלה `persons` (מיגרציה `001_initial_schema.sql`) היא הישות המרכזית היחידה של אדם.
כל שאר הישויות תלויות בה דרך `person_id`:

```
                        persons  (אדם אחד = רשומה אחת)
                           │
   ┌─────────┬─────────────┼──────────────┬────────────┬───────────┐
   │         │             │              │            │           │
person_      person_    education_    staff_       alumni_     sponsor_
accounts     roles      journeys      profiles     profiles    profiles
(כניסה)     (תפקידים)   (מסלול לימודי)  (עובד)      (בוגרת)     (תורם)
                           │
             ┌─────────────┼──────────────┬─────────────┐
        class_          attendance      grades      finance_
        enrollments                                  charges
```

### 3.2 כיצד מטופלים סוגי האנשים השונים

**המפתח הוא `education_journeys`** — "מסלול לימודי" (מיגרציה `20260512162314_education_journeys_part1_create.sql`).
זו הטבלה שהייתה פעם `applicant_profiles` ושונתה כדי לשקף עיקרון חשוב:

> **אדם אחד יכול להחזיק כמה מסלולים לימודיים** — לימודים חוזרים, כיוונים מקבילים, כניסה מחדש
> אחרי נשירה. אין שכפול של האדם.

הסטטוס חי ב-`education_journeys.education_status` (טיפוס `person_education_status`), עם הערכים:
`lead` → `applicant` → `student` → `on_leave` / `graduated` / `expelled` / `lost`.

| סוג אדם | איך מיוצג | הערה |
|---|---|---|
| תלמידה עתידית / ליד | `education_journeys` עם `education_status='lead'` | נוצר מטופס ציבורי או ידנית |
| מועמדת | אותה רשומה, `status='applicant'` | ההמרה נעשית בסיום שלב "החלטה" בתהליך הגיוס |
| סטודנטית | אותה רשומה, `status='student'` | ההמרה נעשית באישור סופי של ועדת הקבלה |
| בוגרת | `status='graduated'` **+** רשומה ב-`alumni_profiles` | ה-RPC `transition_education_status` יוצר את הפרופיל אוטומטית |
| עובד | `staff_profiles` + `staff_positions` (מחלקה, תפקיד, תאריכים) | אדם יכול להחזיק **כמה משרות במקביל** |
| תורם | `sponsors` / `sponsor_profiles` | |
| איש קשר חיצוני | טבלת `contacts` | **⚠ נפרד לגמרי — ראה 3.5** |
| בן משפחה / אפוטרופוס | `person_relatives` (person↔person) + `persons.guardian_person_id` | קרוב משפחה הוא בעצמו `persons` — מונע כפילות פרטי קשר |

### 3.3 האם אותו אדם יכול לקבל כמה תפקידים/סטטוסים בלי כפילות? — **כן.**
- **תפקידים**: `person_roles` היא טבלת קשר רבים-לרבים. אדם יכול להיות גם `teacher` וגם `dorm_director`.
- **משרות**: `staff_positions` מאפשרת כמה משרות פעילות במקביל (עם `start_date`/`end_date`).
- **מסלולים לימודיים**: `education_journeys` — כמה journeys לאדם. יש אינדקס ייחודי חלקי
  (`idx_education_journeys_active_per_dept`) שמונע שני מסלולים פעילים באותה מחלקה.
- **מסלולי לימוד מרובים**: `journey_study_tracks` (מיגרציה `20260903100200_journey_study_tracks_multi.sql`)
  — תלמידה יכולה להיות רשומה ליותר ממסלול אחד (למשל: אוניברסיטה + טורו).
- **מקרה מובהק**: מורה שהיא גם בוגרת שגם תורמת — רשומה אחת ב-`persons`, שלושה פרופילים נלווים.

### 3.4 מנגנוני מניעת כפילויות — **קיימים ועובדים**

| מנגנון | קובץ | מה עושה |
|---|---|---|
| נורמליזציה לזיהוי | `lib/persons/duplicate-match.ts` | משווה שם מנורמל, אימייל, דרכון/ת.ז ללא רווחים, ו-9 הספרות האחרונות של הטלפון (עמיד לקידומות מדינה) |
| מסך "כפילויות" | `GET /api/persons/duplicates` | מציג זוגות חשודים |
| **מיזוג רשומות** | `POST /api/persons/merge` → RPC `merge_persons` | סורק את **כל** מפתחות הזרים ל-`persons` דרך `information_schema`, מעביר את כל ההפניות לרשומה השורדת, מוחק שורות שהיו יוצרות כפילות, מחיל ערכי שדות שנבחרו, ומוחק את הכפילה — **הכל בטרנזקציה אחת** |
| בדיקת כפילות בקליטת עובד | `app/dashboard/staff/` (commit `9c8d891`) | אזהרה לפני יצירת עובד קיים |
| אילוצים ב-DB | `person_accounts.login_email UNIQUE`, `student_credentials.login_email UNIQUE`, `alumni_profiles(person_id) UNIQUE` | |

### 3.5 ⚠ נקודה לדיון: `contacts` נפרד מ-`persons`
טבלת `contacts` (מיגרציה `20260707190000_contacts.sql`) מוגדרת במפורש כ**ספריה עצמאית ללא
שום FK לטבלאות אחרות**. המשמעות: אם ספק חיצוני הוא גם תורם וגם קרוב משפחה של תלמידה —
הוא יופיע פעמיים במערכת, ב-`contacts` וב-`persons`. מיזוג לא יזהה זאת.
**זו החלטת עיצוב שנעשתה במודע** (כתובה בהערות המיגרציה), אך שווה לאשר אותה מחדש בפגישה.

### 3.6 שמירת היסטוריה של אדם
| מנגנון | טבלה | מה נשמר |
|---|---|---|
| היסטוריית סטטוסים | `person_status_history` | כל מעבר `from_status → to_status` + מי שינה + מתי + הערה |
| ציר זמן מאוחד | `GET /api/education/journeys/[id]/timeline` | מאחד: שינויי סטטוס, חתימות שלבים, מסמכים שהועלו, הערות — ממוין כרונולוגית |
| אירועי תהליך | `process_events` | כל אירוע בתהליך גיוס/קבלה |
| מסלול ביקורת | `audit_log` | **כל שינוי** בטבלאות: `persons`, `education_journeys`, `role_privileges`, `person_privileges`, `staff_positions`, `staff_profiles`, `process_instances`, `stage_instances` — כולל הערכים לפני/אחרי ורשימת השדות שהשתנו |
| הערכות | `student_evaluations` | יומן append-only של חוות דעת |

---

## 4. גיוס תלמידות, לידים וקבלה

### 4.1 השרשרת המלאה — מה קיים

```
[1] טופס ציבורי  →  [2] ליד  →  [3] תהליך "גיוס"  →  [4] העברה לוועדה
    /apply            education_journeys      4 תת-שלבים            HandoffButton
                      status='lead'                                 (חסום עד שהשדות מלאים)
                                                       ↓
[7] תלמידה פעילה  ←  [6] אישור סופי  ←  [5] תהליך "קבלה v2" (acceptance_v2)
    status='student'    + חתימה           יהדות → לימודים → פנימייה (מותנה) → אישור סופי
```

### 4.2 פירוט השלבים

**[1] טופס ציבורי** — `app/apply/page.tsx` (459 שורות) + `POST /api/public/applications`
- ללא כניסה. שדות: שם, טלפון, אימייל, תאריך לידה, עיר, כיוון עניין, **מי מגיש** (התלמידה / הורה / נציג), הערה, ושדות מותאמים שהגיוס הוסיף.
- הגנה מפני ספאם: שדה honeypot (`website`) + הגבלת קצב לפי IP (`lib/public/rate-limit.ts`).
- **החלטת עיצוב**: התהליך "גיוס" **לא** נפתח אוטומטית מהטופס הציבורי — במקום זה נוצרת משימה למחלקת האדמיניסטרציה, כי משימת "צור קשר עם הליד" הייתה מוקצית ל"בוט". עובד בודק ופותח את התהליך בעצמו.

**[2] יצירת ליד ידנית** — `POST /api/education/leads` / `POST /api/applications`
- כאן התהליך "גיוס" **כן** נפתח אוטומטית (`start_process('recruitment', …)`).
- `components/education/EducationJourneyForm.tsx` + `QuickLeadModal` — טופס מהיר עם בלוק קהילה ורשימת תפקידי נציג.

**[3] תהליך "גיוס"** — מיגרציית סיד `20260724110000_recruitment_process_seed.sql`
| תת-שלב | משימות | תוצאות אפשריות (finals) |
|---|---|---|
| `contact` (יצירת קשר) | `first_contact` | בוצע-עם-אירוע / בוצע-בלי-אירוע / נדחה (סוגר) / נדחה-לעתיד (סוגר) |
| `documents` (מסמכים) | `collect_docs` + `verify_docs` (מקבילות) | הכל נאסף / חלקי / לא סופק |
| `event` (אירוע) | משימה אחת | האירוע התקיים / לא התקיים |
| `decision` (החלטה) | `make_decision` | **המרה למועמדת** (סוגר) / נדחה / נדחה-לעתיד |

**[4] העברה לוועדת קבלה** — `GET /api/education/journeys/[id]/handoff`
- כפתור `HandoffButton` בכרטיס הליד.
- מחזיר `{ stage_instance_id, ready, missing }` — **חסום עד שכל שדות החובה מלאים** (בדיוק כפי שביקשת).

**[5] ועדת קבלה — `acceptance_v2`** (מיגרציה `20260813120000_acceptance_v2_sequential.sql`)
התהליך **סדרתי** (לא מקבילי):
```
התחלה → בירור יהדות → בדיקה לימודית → פנימייה (מותנה) → אישור סופי
                ↓ נדחה = סוגר      ↓ נדחה = סוגר    ↓ נדחה = סוגר
       הפניה לרופאה / לפסיכולוגית → שלבים מקבילים "מידעיים"
```
| שלב | תפקיד חותם | תוצאות |
|---|---|---|
| `jewishness` | `jewishness_officer` | אושר / חלקי / נדחה (סוגר) |
| `academic` | `head_of_studies` | אושר / נדרש מבחן / הפניה לרופאה / הפניה לפסיכולוגית / נדחה |
| `dormitory` | `dorm_director` | אושר / הפניה לרופאה / הפניה לפסיכולוגית / נדחה |
| `medical` | `doctor` | כשירה / לא כשירה |
| `medical_psych` | `psychologist` | כשירה / לא כשירה |
| `final_approval` | `school_director` | התקבלה / התקבלה-מותנה / נדחתה / לימודי חוץ / נדחה לעתיד |

- **התהליך הישן (`acceptance`, ועדה מקבילית) עדיין קיים** ומועמדות שכבר בתוכו ממשיכות בו. כל שאילתה במערכת מטפלת בשני הקודים (`lib/workflow/acceptance-codes.ts`).
- **חתימה דיגיטלית בכל שלב** — מוקלדת או מצוירת (`components/workflow/SignatureCapture.tsx`, `lib/workflow/signature.ts`). חתימה מוקלדת חייבת להתאים לשם המלא של החותם.
- **אכיפת סמכות חתימה** — `lib/workflow/stage-access.ts`: שלב עם `required_role_code` נחתם **רק** ע"י בעל התפקיד; העקיפה היחידה היא `superadmin`.
- **גיטינג פנימייה** — פונקציה `acceptance_apply_dormitory_gating`: אם `needs_dormitory=false`, שלב הפנימייה מדולג ואישור סופי מופעל.
- **משימות והתראות אוטומטיות** — `lib/workflow/acceptance-tasks.ts`: כשמועמדת מגיעה לשלב תפקידי, כל בעלי התפקיד מקבלים משימה + התראה בפעמון + פוש.

**[6]–[7] הפיכה לתלמידה** — RPC `complete_stage` (מיגרציה `20260703170000_admission_student_conversion.sql`)
בסיום שלב עם final שסוגר את התהליך עם `process_finish_reason='admitted'`, אותה טרנזקציה
מעדכנת את `education_status` ל-`student` ורושמת ב-`person_status_history`.

### 4.3 קבלה לפנימייה — האם תהליך נפרד?
**לא נפרד — הוא שלב בתוך תהליך הקבלה** (`dormitory`), אך **מותנה**: הדגל `needs_dormitory`
נקבע בכרטיס הליד (`DormitoryFlagPanel`), וגיטינג ב-DB מדלג על השלב אם אין צורך.
**השיבוץ הפיזי לחדר** נעשה בנפרד לגמרי במודול הפנימייה (`dorm_assignments`) — לא כחלק מהקבלה.

### 4.4 מה עובד מקצה לקצה
**עובד בקוד ומכוסה בטסטים:** כל השרשרת מ-[1] עד [7], כולל תבניות התהליכים, החתימות,
המשימות האוטומטיות, ההתראות והמרת הסטטוס.
**מה עדיין דורש בדיקה אנושית:** התהליך הזה **מעולם לא נבדק מקצה לקצה בפרודקשן ע"י 4–5
משתמשים אמיתיים** במקביל. הטסטים הם טסטי לוגיקה טהורה — הם לא מריצים DB.

---

## 5. סטודנטיות ותיק אישי

### 5.1 המסך
`app/dashboard/education/students/[id]/page.tsx` → `LeadViewClient.tsx` (510 שורות).
אותו רכיב משמש לליד, למועמדת ולתלמידה — הטאבים והפאנלים משתנים לפי הסטטוס.

### 5.2 טאבים (צד שמאל)
| טאב | תוכן |
|---|---|
| **סקירה** | `StudentOverviewTab` — נתוני-על מ-`/api/students/[id]/overview` |
| **אישי** | שם מלא (משפחה/פרטי/אמצעי), שם עברי, תאריך לידה, מגדר, מצב משפחתי, אזרחות, דרכון/ת.ז, טלפונים (עם קישור WhatsApp), אימייל, כתובת מלאה |
| **תקשורת** | `LeadCommunicationPanel` — יומן שיחות ותקשורת |
| **רקע** | משפחה (`person_relatives`) + קהילה (`journey_communities` עם איש קשר פר-מסלול) |
| **מידע גיוס** | כיווני עניין, מקור הפניה, הערה |
| **מסמכים** | `JourneyDocumentsPanel` — העלאה, צפייה, קטגוריה, סטטוס בדיקה |
| **לימודים** | מחלקה, התמחות, קבוצה, שנה, שנת התחלה, תאריך רישום + **מחזור חיים** (`StudentLifecyclePanel`): מעברי סטטוס עם היסטוריה |
| **דוח** | `StudentReportTab` — דוח מסכם |

### 5.3 פאנלים (צד ימין) — 14 פאנלים ב-3 קבוצות מתקפלות
**קבוצה "לימודים":**
1. `StudentDashboardPanel` — מספר שיעורים מתחילת השנה, אחוז נוכחות, ממוצע ציונים
2. `StudyTrackPanel` — מסלול/מסלולים
3. `StudyPlanPanel` — תוכנית לימודים (`journey_study_plans`)
4. `KodeshExceptionsPanel` — חריגות קודש
5. `PlacementsPanel` — שיבוצים
6. `EvaluationsPanel` — חוות דעת (`student_evaluations`)

**קבוצה "חיי קמפוס":**
7. `StaffChavrutaPanel` · 8. `StaffShabbatPanel` · 9. `StudentCalendarPanel` · 10. `MeetingsPanel`

**קבוצה "ניהול וכספים":**
11. `StudentStructuresPanel` — שיוכים מבניים
12. `PortalCredentialsPanel` — יצירת/איפוס סיסמת פורטל לתלמידה
13. `StaffStudentMessagesPanel` — שליחת הודעה לתלמידה
14. `StudentFinancePanel` — מצב כספי

**קבועים:** `ProcessInfoBlock` (תהליכים פעילים), `StageSignatures` (חתימות), `JourneyTimeline` (ציר זמן),
וקישור **"צפייה בעיני התלמידה"** → `/dashboard/education/student-view/[id]`.

### 5.4 מה חסר בתיק
- **פנימייה, רפואה, פסיכולוגיה, מזון — לא מופיעים בתיק התלמידה.** הם קיימים במלואם אך רק במודולים הנפרדים שלהם. זו החלטת הרשאות מודעת, אבל היא אומרת שאין "מבט אחד" על התלמידה.
- אין **הערה חופשית עם רמת סודיות שנקבעת בעת הכתיבה** (ראה סעיף 12).

---

## 6. עובדים ותיק עובד

### 6.1 מה קיים

**מסך**: `/dashboard/staff` (1,044 שורות) + `AddEmployeeModal` (טופס 6 טאבים):
אישי · קשר · משרה · חוזה · מסמכים · נוסף.

**טבלאות**:
- `staff_profiles` — `employment_type` (staff/intern/volunteer/contractor), `hire_date`, `fire_date`, `notes`
- `staff_positions` — `department_id`, `position_ru`/`position_he`, `position_id` → `reference_positions`, `is_head`, `start_date`, `end_date` (**כמה משרות במקביל**)
- `reference_positions` — ספריית תפקידים ניתנת לעריכה (`/dashboard/settings/positions`)
- `departments` — עץ מחלקות עם `parent_id` ו-`head_person_id`

**מה עובד**:
- קליטת עובד אטומית — RPC `create_staff_member` (person + profile + position בטרנזקציה אחת)
- בדיקת כפילות לפני יצירה + פאנל בדיקה עצמית (`/api/staff/health`)
- הצמדת תפקידים (`person_roles`) והרשאות אישיות (`person_privileges`)
- סיום העסקה (`fire_date`) — ניסוח כן, בלי מחיקה
- **"תצוגה מקדימה של scope"** (`/api/staff/scope-preview`) — מראה למנהל בדיוק מה העובד יראה
- שכר: תעריפים אישיים ותלושים — ראה סעיף 16.2

### 6.2 ⚠ מה **לא** נשמר במבנה — ממצא חשוב

הטופס אוסף: **מספר חוזה, תאריך חוזה, שכר, מטבע, קובץ חוזה, רמת השכלה, התמחות, שנת סיום,
תעודות/הסמכות, מתכונת עבודה, אנשי קשר נוספים, הערה.**

אבל ב-`app/api/staff/route.ts` (שורות ~62–75) כל אלה נארזים כ-**JSON אחד ונדחסים לתוך
`staff_profiles.notes`** — שדה טקסט חופשי:

```js
const extra = {}
if (body.work_schedule) extra.work_schedule = …
if (body.education)     extra.education     = …   // level, specialty, graduation_year, certificates
if (body.contract)      extra.contract      = …   // number, date, salary, currency, file_name
…
notes: JSON.stringify(extra)
```

**המשמעות המעשית:**
- **אי אפשר לחפש, לסנן או להפיק דוח** לפי שכר, רמת השכלה, תאריך חוזה או תעודות.
- **קובץ החוזה לא נשמר בפועל** — נשמר רק `file_name` (שם הקובץ). אין העלאה ל-Storage.
- **אין מקום לקורות חיים, דיפלומות או מכתבי המלצה כקבצים.**
- מודול המסמכים (`document_records`) קשור אך ורק ל-`journey_id` של תלמידה — **אין מסמכי עובד**.
- קיימת טבלה legacy `person_documents` (מיגרציה `20260617120000`) שהייתה יכולה לשמש לכך, אך **שום קוד לא קורא או כותב אליה** מלבד רשימת המיזוג.

**מסקנה לסעיף 6:** תיק עובד **קיים בסיסית** (זהות, משרות, מחלקות, שכר), אך **תיק עובד עשיר
(קו״ח, דיפלומות, המלצות, מסמכים) — לא נבנה.**

---

## 7. לימודים והמבנה האקדמי

### 7.1 מפת הישויות והקשרים

```
departments (עץ מחלקות/יחידות)
    │  head_person_id → persons          ← "מי ראש היחידה" קובע הרשאות
    │
    ├── study_tracks (מסלולי לימוד: בי״ס, קולג׳ 9/11, אונ׳ כלכלה, אונ׳ פרסום, טורו)
    │        │  years_count
    │        └── journey_study_tracks (רבים-לרבים!) → education_journeys
    │                 year_level (1–8), completed_at
    │
    ├── class_groups  ← הישות המרכזית, משמשת בשלושה תפקידים:
    │      • is_semester=true            → "קבוצת-סמסטר" (מסלול + year_label + term_number)
    │      • parent_semester_id set      → "קורס" (subject_id + hours + מורים)
    │      • department=KODESH           → "רמת קודש" (בלי parent)
    │      │
    │      ├── class_teachers (person, monthly_rate)
    │      ├── class_enrollments (journey_id, assignment_status)
    │      ├── class_schedule_slots (יום, שעה, בניין, חדר, is_kodesh_block, approval_status)
    │      ├── assessments → grades (journey_id, score)
    │      └── lessons (תאריך, שעה, נושא, בוטל?) → attendance (journey_id, status, weight)
    │
    ├── subjects (מקצועות, לפי מסלול+שנה)
    ├── specialties (התמחויות)
    ├── study_groups (קבוצות "ותיקות" — ראה 7.7)
    ├── reference_directions / reference_levels (כיוונים ורמות)
    ├── buildings → rooms (כיתות)
    └── semesters (year_label, term_number, price, status) → semester_enrollments
```

### 7.2 שנות לימוד, סמסטרים ותאריכים
- **שנת לימוד**: מיוצגת כטקסט `year_label` (למשל `תשפ"ז`) על `class_groups` ועל `semesters`.
  **⚠ אין טבלת `academic_years` נפרדת.** זו החלטה מודעת המתועדת במיגרציות (`20260903100300`, `20260903110100`).
- **סמסטרים**: שני מודלים מקבילים —
  1. `semesters` (year_label, term_number, **price**, status open/closed) — משמש **לכספים**;
  2. `class_groups` עם `is_semester=true` — משמש **לניהול הלימודים** (מיגרציה `20260720150000_unify_semester_class_group.sql`).
- **תאריכי התחלה/סיום**: `class_schedule_slots` מחזיק `start_date`/`end_date` (`lib/education/schedule-dates.ts`), ומהם מיוצרים השיעורים.
- **מעבר שנה אוטומטי**: `academic_year_settings` (חודש/יום, `auto_enabled`, `last_rolled_year`) + RPC `advance_academic_year` — מקדם `journey_study_tracks.year_level` ב-1, ומסמן `completed_at` למי שסיימה. אידמפוטנטי (פעם בשנה).

### 7.3 האם תלמידה יכולה להיות בכמה מסלולים/קבוצות במקביל? — **כן**
- **מסלולים**: `journey_study_tracks` הפכה לרבים-לרבים במיגרציה `20260903100200`.
- **קבוצות**: `class_enrollments` — תלמידה רשומה לכמה קורסים ולכמה קבוצות-סמסטר.
- **קודש + חול במקביל**: זהו עקרון הליבה — שיבוץ הקודש (רמה) **נפרד לחלוטין** מהמסלול הראשי, כך שתלמידות ממסלולים ושנים שונות לומדות יחד באותה רמת יהדות.

### 7.4 קורסים, מכסת שעות ומורים
- **קורס** = `class_groups` עם `parent_semester_id`. שדה `hours` = שעות מוצהרות (מיגרציה `20260903110100`).
- **מורים לקורס**: `class_teachers` (כמה מורים לקורס, כל אחד עם `monthly_rate`).
- **אישור מורה לקורס**: `teacher_course_approvals` — חנה מציעה, הרב משה מאשר/דוחה/מבקש מידע.
- **מכסת שעות למורה**: `teacher_hour_quotas` (לפי שנה, או שנה+סמסטר), עם `source` = `contract`/`manual`.
  **חריגה ממכסה רק מזהירה — לא חוסמת** (`lib/education/teacher-quota.ts`, פונקציה `isOverQuota`).
- **בדיקות שלמות קורס** (`lib/education/course-checks.ts`): מזהה קורס בלי מורה / בלי שעות / בלי שיבוץ / בלי כיתה / פער בין שעות מוצהרות למשובצות.
- **דוח שעות מורים**: `/dashboard/education/teachers-hours`.

### 7.5 מערכת שעות ושיעורים
- **שיבוץ** (`class_schedule_slots`): יום בשבוע, שעת התחלה/סיום, בניין, חדר, `is_kodesh_block`.
- **זיהוי התנגשויות**: `lib/education/schedule-conflicts.ts` + `slot-conflict-check.ts`.
- **אישור שיבוץ בזמן קודש** (מיגרציה `20260826140000`): "הבוקר שייך לקודש". מנהל לימודי חול **יכול** לשבץ בזמן הזה, אך השיבוץ נכנס כ-`pending`, **לא מייצר שיעורים**, ומחכה לאישור מנהל כללי. מסך: `/dashboard/education/schedule-approvals`.
- **ייצור שיעורים אוטומטי**: cron יומי ב-03:00 (`vercel.json` → `/api/cron/generate-lessons`) לפי `lib/education/lesson-generation.ts`. מדלג על שיבוצים `pending` ועל ימים ללא לימודים.
- **לוח שנה אקדמי עם סוגי ימים** (מיגרציה `20260904120000_calendar_day_types.sql` — החדשה ביותר):
  טבלת עזר `calendar_day_types` **ניתנת לעריכה** עם 4 סוגים —
  `full_off` (חג/חופשה — חוסם הכל) · `no_kodesh` (חול רץ, קודש לא) · `kodesh_only` (רק קודש) · `shortened` (יום מקוצר).
  ייצור השיעורים מחליט **פר סוג קבוצה** (קודש מול חול). מסך: `/dashboard/education/no-lesson-days`.

### 7.6 נוכחות וחיסורים
- 3 סטטוסים בלבד: `present` / `late` / `absent` (מיגרציה `20260715140000`).
- **משקל מחושב ב-DB**: `absent`=1, `late`=0.5, `present`=0 (עמודה `weight` GENERATED).
- **חלון עריכה למורה**: משך השיעור + 30 דקות (`lib/education/attendance-window.ts`), עם אפשרות
  להעניק זמן נוסף למורה מסוים (`teacher_attendance_grants` — קבוע או חד-פעמי).
- **דריסות רשימת נוכחים** (`lesson_roster_overrides`) — נוכחות חד-פעמית של אורחת.
- **הערות שיעור** (`lesson_notes`).
- **מקרי היעדרות** (`absence_cases`, מיגרציה `20260818120000`): אחראי מסמן היעדרות ו**מעביר לטיפול
  מחלקה אחרת**. סטטוס: `open` → `in_handling` → `resolved`.
- **הסלמה לילית**: cron ב-06:00 מזהה תלמידה עם 5+ חיסורים ב-30 יום ושולח התראה לצוות המחלקה
  (`lib/education/absence-alerts.ts`), עם דה-דופליקציה כדי שלא יטפטף כל לילה.
- **לוח "בסיכון"**: `/api/education/at-risk`.

### 7.7 ⚠ ממצא טכני: טבלת `students` ה-legacy
קיימת טבלה ישנה `students` שהוחלפה ב-`education_journeys`.
**שום קוד ושום מיגרציה לא כותבים אליה יותר** (אומת בגריפ), אך **5 מקומות עדיין קוראים ממנה**:
- `app/api/education/study-groups/route.ts` — ספירת תלמידות בקבוצת לימוד
- `app/api/education/study-groups/[id]/route.ts` — אותו דבר
- `app/api/staff/scope-preview/route.ts` (2 שאילתות) — רשימת התלמידות שהעובד יראה
- `lib/education/permissions.ts:500` — קביעת שיוך מחלקתי של אדם

**המשמעות:** מוני התלמידות ב"קבוצות לימוד" וב"תצוגה מקדימה של scope" יציגו נתונים מהעבר
או אפס. **אי אפשר לדעת מהקוד** כמה שורות יש בטבלה הזו בפרודקשן — צריך לבדוק ב-Supabase.

---

## 8. הישגים וחובות אקדמיים

זהו הסעיף שבו הפער הגדול ביותר בין מה שנשאל למה שקיים.

### 8.1 מה קיים

| יכולת | מצב | מקור |
|---|---|---|
| **מטלות/עבודות** | ✅ קיים | `assessments` (כותרת, ציון מקסימלי, תאריך, תיאור) פר קבוצת לימוד |
| **ציונים** | ✅ קיים | `grades` (`assessment_id`, `journey_id`, `score`, `comment`) |
| **יומן ציונים (gradebook)** | ✅ קיים | `GET /api/education/class-groups/[id]/gradebook` + `GradesTab` + `GradeEntryPanel` |
| **ממוצע ציונים לתלמידה** | ✅ קיים | `StudentDashboardPanel`, `lib/students/overview.ts` |
| **ייצוא CSV** | ✅ קיים | `lib/csv.ts` |
| **חוות דעת מילולית** | ✅ קיים | `student_evaluations` — יומן append-only, נראה לכל מי שמעל הכותב |
| **אחוז נוכחות** | ✅ קיים | מחושב מ-`attendance.weight` |
| **סטטוס שיבוץ** | ✅ קיים | `class_enrollments.assignment_status`: `suggested` / `active` / `exempt` / `pending_assessment` / `special_program` |

### 8.2 מה **לא** קיים — ממצא מרכזי

**אין במערכת ישות של "השלמת קורס" ואין ישות של "חוב אקדמי".**

בדיקות שביצעתי:
- `class_enrollments` (הטבלה שקושרת תלמידה לקורס) מכילה: `journey_id`, `class_group_id`,
  `enrolled_at`, `assignment_status`, `approved_by`, `approved_at`, `exempt_reason`.
  **אין בה שדה של ציון סופי, "עבר/נכשל" או "הושלם".**
- גריפ על `academic_debt` / `debt` בכל הקוד מחזיר רק: (א) חוב **כספי** (`overdue`, `debtor_count`),
  (ב) קוד התראה בשם `academic_debt` בטבלת `student_alert_types` — כלומר **תווית להתראה ידנית בלבד**.
- אין `course_completions`, אין `academic_debts`, אין `final_grades`, אין `transcripts`.

**מה זה אומר בפועל:**
| השאלה | התשובה מהקוד |
|---|---|
| כיצד המערכת קובעת שתלמידה השלימה קורס? | **היא לא קובעת.** אין מנגנון. |
| ציונים והערכות? | ✅ קיימים — אבל ברמת מטלה בודדת, לא ציון סופי לקורס |
| קורס שלא הושלם בהצלחה? | **לא מיוצג** |
| יצירת חוב אקדמי? | **לא קיים** |
| סטטוס החוב, מעקב השלמה, היסטוריה? | **לא קיים** |
| הצגת חובות בתיק התלמידה? | **לא קיים** (רק אם מישהו יפתח ידנית התראה מסוג `academic_debt`) |
| התראות/משימות סביב חוב? | קיים **רק** בצורה ידנית דרך מודול ההתראות |

### 8.3 מה כן אפשר לעשות היום (עקיפה)
מנגנון ה**התראות פר-תלמידה** (`student_alerts`, מיגרציה `20260903120000`) כולל סוג מובנה
`academic_debt` (חוב אקדמי) עם מצבים `new` → `in_progress` → `waiting` → `closed`, ומונה
התראות פתוחות פר תלמידה. זהו **המעקב הידני** היחיד הקיים היום.

### 8.4 מה נדרש כדי לסגור את הפער
(תיאור בלבד — לא בוצע שינוי)
1. הוספת שדות השלמה ל-`class_enrollments`: `completion_status` (`in_progress`/`passed`/`failed`/`incomplete`), `final_grade`, `completed_at`.
2. טבלת `academic_debts` (journey, course, סיבה, מועד יעד, סטטוס, מי סגר, מתי).
3. חיבור אוטומטי: כשקורס נסגר וסטטוס = `failed`/`incomplete` → נוצר חוב.
4. פאנל "חובות אקדמיים" בתיק התלמידה + חיבור למנגנון ההתראות והמשימות הקיים.

---

## 9. יומנים

### 9.1 היומן האישי של עובד/מורה — `/dashboard/calendar`
המסך הגדול ביותר במערכת אחרי מודול הלימודים (2,139 שורות, 8 קבצים).

**מקורות שהיומן מאחד** (`app/api/calendar/*`):
| מקור | טבלה/מקור | מה מוצג |
|---|---|---|
| פגישות | `appointments` (+`appointment_attendees`) | פגישה אישית, אופציונלית עם תלמידה |
| ימי חסימה | `calendar_blocks` | יום שהעובד לא זמין |
| אירועים אישיים | `calendar_events` | כל דבר + תזכורת (`reminder_at`) |
| שיעורים | `lessons` | השיעורים שהמורה מלמד |
| מערכת שעות | `class_schedule_slots` | הסידור הקבוע |
| משימות | `tasks` | משימות עם `due_date` |
| ימי הולדת | `persons.birth_date` | `lib/calendar/birthday.ts` |
| תאריך עברי | `lib/calendar/hebrew.ts` | תצוגה מקבילה |

**יכולות נוספות:**
- **מניעת הזמנה כפולה** — `lib/calendar/overlap.ts` (שגיאת `overlap_error`)
- **הזמנות פגישה** — `POST /api/calendar/appointments/[id]/respond` (אישור/דחייה)
- **פיד ICS חיצוני** — `/api/calendar/feed-link` + `/api/public/calendar-feed` עם טוקן חתום
  (`lib/calendar/feed-token.ts`) → **חיבור ל-Google Calendar** (`GoogleCalendarLink.tsx`)
- **תזכורות** → הפעמון + פוש (מתממשות ב-cron היומי או בעת פתיחת הפעמון)

### 9.2 היומן של התלמידה
- **בפורטל**: `StudentCalendarPanel` (`personal`) + `MeetingsPanel` (קריאה בלבד).
- **אירועים אישיים של תלמידה**: טבלה נפרדת `student_personal_events` + `/api/portal/personal-events` — התלמידה **כן** יכולה להוסיף אירוע אישי משלה.
- **מה היא רואה**: השיעורים שלה, המפגשים שלה, האירועים האישיים שלה, החברותא שלה, השבתות שלה.
- **מה חסר** (מזוהה גם ב-`docs/GAP_ANALYSIS.md`): צביעת יום לפי נוכחות + פירוט "לחיצה על יום → כל השיעורים של אותו יום עם נוכחות, מורה ותוכן". `docs/GAP_ANALYSIS.md` מציין שזה בוצע (`Phase 1 ✅ DONE (#89)`) — יש לאמת מול המסך בפועל.

### 9.3 היומן של מורה/מרצה
זהה ליומן העובד + `TeacherDashboard` + `/api/education/my-lessons` + `/api/education/my-groups`.
המורה רואה את השיעורים שלה, סימון נוכחות בחלון הזמן, והזנת נושא השיעור.

### 9.4 חיבור מערכת השעות/פגישות/אירועים/משימות ליומן
**כולם מחוברים** — היומן קורא מכל 8 המקורות ומציג אותם על אותה רשת חודשית.
`/api/calendar/schedule` מחזיר את מערכת השעות; `/api/calendar/tasks` את המשימות; וכן הלאה.

---

## 10. משימות

**טבלאות**: `tasks`, `task_comments`, `task_watchers`, `task_status_history`, `task_transitions`
**מסכים**: `/dashboard/tasks`, `/dashboard/tasks/[id]` · **APIs**: 9 routes

| יכולת | מצב | פרטים |
|---|---|---|
| יצירת משימה | ✅ | כותרת, תיאור, מודול מקור, `metadata` (JSONB) |
| הקצאה לאדם אחר | ✅ | `assignee_type='person'` |
| הקצאה למחלקה (פול) | ✅ | `assignee_type='department'` + סטטוס `unassigned` + `POST /api/tasks/[id]/claim` ("לקחת משימה") |
| הקצאה לתפקיד/משרה | ✅ | `assignee_type='position'` → `reference_positions` |
| "לא מוקצה" כן-אמיתי | ✅ | `assignee_type='unassigned'` |
| מועדים | ✅ | `due_date` + `due_time` + `due_all_day` |
| סטטוסים | ✅ | `unassigned` / `pending` / `in_progress` / `review` / `completed` / `cancelled` / `declined` |
| עדיפות | ✅ | `low` / `normal` / `high` / `urgent` |
| תגובות | ✅ | `task_comments` + CRUD מלא |
| צופים (watchers) | ✅ | `task_watchers` |
| היסטוריית סטטוס | ✅ | `task_status_history` |
| משימות חוזרות | ✅ | `task_series` + `lib/tasks/recurrence.ts` (מכוסה בטסטים) |
| שרשור משימות | ✅ | `task_transitions` — סיום משימה א׳ פותח משימה ב׳ |
| **קישור לישות אחרת** | ✅ חלקי | דרך `metadata` JSONB: `{lead_id}`, `{employee_id}`, `{quality_check_id}`. **המודולים המותרים מוגבלים ב-CHECK**: `general` / `education` / `staff` / `quality_control` |
| יצירה אוטומטית מ-workflow | ✅ | `stage_task_templates` — כל שלב בתהליך מייצר משימות אוטומטית |
| היררכיה והרשאות | ✅ | `lib/tasks/access.ts` + הרשאות `tasks.view_own` / `view_all` / `create` / `assign` / `delete` |
| הצגה ביומן | ✅ | `/api/calendar/tasks` |
| התראה + פוש | ✅ | `lib/notifications/create.ts` |

**⚠ מגבלה**: אי אפשר לקשר משימה ישירות ל**מסמך**, ל**תלמידה** בצורה מובנית (רק דרך `metadata`
חופשי), או למודולים כמו פנימייה/כספים/רפואה — ה-CHECK על `tasks.module` מגביל ל-4 ערכים.

---

## 11. מסמכים

### 11.1 מה קיים — **מסמכי תלמידה בלבד**

**טבלה חיה**: `document_records` (מיגרציה `20260707180000` + `20260724150000`)
- `journey_id` → **מקושר תמיד לתלמידה/מועמדת** (לא ל-`persons`)
- `doc_type`: `id_card` / `passport` / `certificate` / `medical` / `financial` / `contract` / `visa` / `other`
- `category`: `general` (כללי) / `jewish` (יהדות) / `academic` (לימודים) / `dormitory` (פנימייה) / `other`
- `review_status`: `received` (התקבל) / `checked` (נבדק) / `rejected` (נדחה) + `reviewed_by` / `reviewed_at`
- `status`: `active` / `archived` · `issued_date` / `expiry_date` · `file_url`

**אחסון**: Supabase Storage, בקט **פרטי** בשם `documents` (`lib/documents/storage.ts`).
הצפייה נעשית דרך **signed URL** בלבד (`GET /api/documents/[id]/signed-url`) — הקובץ לא נגיש ישירות.

**מסכים ו-APIs**:
- `/dashboard/documents` — רשימה כללית · `/dashboard/documents/[id]` — מסמכי תלמידה
- `GET /api/documents/expiring` — מסמכים שפג/עומד לפוג תוקפם (`lib/documents/expiry.ts`, מכוסה בטסטים)
- `POST /api/documents/journeys/[id]/upload` · `POST /api/documents/[id]/review`
- הרשאות: `documents.view` / `documents.manage` + `lib/documents/journey-access.ts` (גישה פר-מסלול)

**חתימות דיגיטליות**: `stage_signatures` — תמונת חתימה מצוירת נשמרת באותו בקט, בנתיב מוגן מפני IDOR (`lib/workflow/signature-storage.ts`).

### 11.2 ⚠ מה **לא** קיים
| נדרש | מצב |
|---|---|
| מסמכי **עובד** | ❌ אין. הטבלה `person_documents` קיימת אך מתה (שום קוד לא קורא/כותב אליה) |
| מסמכים **משרדיים/מחלקתיים** | ❌ אין. אין ישות "מסמך של מחלקה" |
| מסמכים **משותפים** | ❌ אין. אין ספרייה משותפת |
| הרשאות **פר-מסמך** | ❌ אין. ההרשאה היא ברמת המודול (`documents.view/manage`) + השיוך למסלול. אי אפשר לומר "רק X ו-Y יראו את המסמך הזה" |
| ניהול **גרסאות** | ❌ אין |

### 11.3 טבלאות legacy שאינן בשימוש
`document_types`, `document_categories`, `person_documents`, `journey_documents` — נוצרו בעיצוב
ישן. המיגרציה `20260707180000` מציינת במפורש: "המודול הזה **לא** משתמש בהן ו**לא** נוגע בהן".
הן נשארו כדי לא לשבור נתונים ישנים.
**⚠ `journey_documents` היא היוצאת דופן** — היא כן משמשת בפאנל המסמכים של כרטיס התלמידה (`JourneyDocumentsPanel` → `/api/documents/journeys/[id]`), כלומר יש **שני מנגנוני מסמכים במקביל**.

---

## 12. עבודה חינוכית וליווי אישי

### 12.1 מה קיים

| יכולת | מצב | מקור |
|---|---|---|
| **מדריכות / חברותא** | ✅ מלא | `chavruta_pairs` (שיוך מורה↔תלמידה, ללא שכר) + `chavruta_teachers` + מפגשים (`staff_work_entries` מסוג `chavruta`) |
| **מרכז חברותא** | ✅ | `/dashboard/chavruta`, `/dashboard/education/chavruta` |
| **מפגשי חברותא עם סיכום** | ✅ | `summary` (נראה לתלמידה) + `private_notes` (**לעולם לא לתלמידה**) |
| **מחנכות / אמהות בית** | ⚠ חלקי | קיימים תפקידים `embait`, `dorm_director`, `mashgiach`; קיים `staff_positions.is_head`. **אין ישות "מחנכת של תלמידה X"** מלבד החברותא |
| **שיחות אישיות ודוחות שיחה** | ✅ חלקי | `MeetingsPanel` (פגישות מורה↔תלמידה עם סימון "בוצע") + `LeadCommunicationPanel` (יומן תקשורת) + `student_evaluations` (חוות דעת) |
| **מעקב אחר תלמידה** | ✅ | `student_alerts` (התראות עם מצבים) + `absence_cases` + לוח "בסיכון" |
| **Follow-up** | ✅ | `lib/follow-up.ts` + `medical_visits.followup_date` + `psych_sessions.followup_date` + `/api/doctor/followups` + `/api/psychologist/followups` |
| **העברת מידע בין אנשי צוות** | ✅ | `absence_cases.assigned_department_id` — "אני מסמן ומעביר למחלקה אחרת"; משימות; התראות; צופים במשימה |
| **הודעות לתלמידה** | ✅ | `student_messages` (צוות → תלמידה, חד-כיווני; התלמידה קוראת בפורטל) |
| **שבתות** | ✅ | `staff_work_entries` מסוג `shabbat_host`/`shabbat_family` + `staff_event_attendees` |

### 12.2 רמות סודיות והרשאות למידע משיחה אישית — **התשובה המדויקת**

**מה כן קיים** (4 מנגנונים אמיתיים):

1. **`private_notes` — הפרדה דו-שכבתית**
   `lib/chavruta/view.ts` ו-`lib/staff-comp/event-view.ts` הם פונקציות טהורות עם הערה מפורשת
   *"אינווריאנט קריטי של פרטיות"*: השדה `private_notes` מוסר מהתגובה כשהקורא אינו צוות.
   שתי הפונקציות מכוסות בטסטים.
   **מגבלה**: זו הפרדה בינארית — "צוות" מול "תלמידה". אי אפשר לומר "רק מנהלת הפנימייה תראה".

2. **`student_alerts.is_sensitive` — דגל רגישות פר-התראה**
   התראה מסומנת כרגישה נראית **רק** למי שיש לו את ההרשאה הייעודית `view_sensitive_alerts`.
   ההרשאה **לא ניתנה אוטומטית לאף אחד** — הבעלים משייך אותה לתפקידים כרצונו (מיגרציה `20260903120000`).
   `student_alert_types.default_sensitive` קובע ברירת מחדל לפי סוג ההתראה (`medical` = רגיש כברירת מחדל).
   זהו המנגנון **המדויק ביותר** שקיים היום — במפורש **לא** מודל "הרופאה רואה הכל".

3. **`redactSensitivePerson` — הסתרת שדות PII**
   `lib/persons/redact.ts`: השדות `passport_number`, `address`, `nationality`, `marital_status`,
   `birth_date` מוחזרים כ-`null` לכל מי שאין לו `persons.view_sensitive`. מכוסה בטסטים.

4. **`person_privileges` — הרשאות אישיות (grant/deny)**
   מנהל יכול לפתוח לעובד מסוים הרשאה נקודתית (למשל `write_evaluation` למורה) או **לחסום** לו
   הרשאה שהתפקיד נותן. יש גם `expires_at` (הרשאה זמנית).

**מה לא קיים:**
> **אין אפשרות להגדיר, בעת כתיבת הערה, רשימת מורשים ספציפית לאותה הערה.**
> אין שדה `visibility` / `confidentiality_level` על `student_evaluations`, על הערות שיחה או על
> `student_messages`. הסודיות היא **תמיד ברמת המודול או ההרשאה**, לא ברמת הרשומה הבודדת —
> למעט הדגל הבינארי `is_sensitive` בהתראות.

---

## 13. פסיכולוגיה, רפואה ורווחת התלמידה

### 13.1 מה קיים לכל בעל מקצוע

**רופאה** — מודול `doctor` (מיגרציה `20260707150000`)
- `medical_profiles` (אחד למסלול): סוג דם, מחלות כרוניות, אלרגיות, תרופות, איש קשר לחירום, הערות
- `medical_visits`: תאריך, סיבה, אבחנה, טיפול, מי קיבל, **תאריך ביקורת**, סטטוס `open`/`closed`
- מסכים: `/dashboard/doctor`, `/dashboard/doctor/[id]` · APIs: `/api/doctor/*` (7 routes)
- **מאגר "מטופלות"**: `/api/doctor/students` + `/api/doctor/referrals` — כל מועמדת ששלב הרפואה שלה פעיל
- **מעקב ביקורות**: `/api/doctor/followups` — קרובות/באיחור (`lib/doctor/medical.ts`, מכוסה בטסטים)

**פסיכולוגית** — מודול `psychologist` (מיגרציה `20260707160000`), מבנה מראה:
- `psych_profiles`: תלונות, אנמנזה, **רמת סיכון**, מקור ההפניה, הערות
- `psych_sessions`: תאריך, סוג (`intake`/`followup`/`crisis`/`group`/`other`), תוכן, תאריך ביקורת, סטטוס
- `/dashboard/psychologist`, `/api/psychologist/*` (7 routes)

**כניסה מאוחדת**: `/dashboard/health` — כרטיס אחד לשני המודולים.

### 13.2 זרימת מידע — **מהצוות אל בעל המקצוע** ✅ עובד
הכיוון הזה בנוי היטב דרך **מנגנון ההפניות בתהליך הקבלה**:
```
בדיקה לימודית (head_of_studies)  ──[הפניה לרופאה]──→  שלב medical מופעל
בדיקת פנימייה (dorm_director)    ──[הפניה לפסיכולוגית]──→  שלב medical_psych מופעל
```
- כשההפניה נשלחת, נוצרת אוטומטית **משימה** לבעל התפקיד + **התראה** בפעמון + **פוש** לנייד.
- הרופאה רואה **מי הפנה, למה, וההערה** (`/api/doctor/referrals`), את המסמכים שהועלו (`/api/doctor/referrals/document/[id]`), ואת הרשומות הרפואיות הקודמות.
- הרופאה חותמת ישירות מהמסך שלה — בלי לקבל גישה למודול החינוך.
- **החלטת סמכות**: `lib/workflow/stage-access.ts` — רק בעל התפקיד `doctor` יכול לחתום על שלב `medical`; רק `psychologist` על `medical_psych`. אין דליפת סמכות.

### 13.3 הכיוון ההפוך — **מאירועים לימודיים אל הגורמים החינוכיים** ✅ עובד חלקית
| מנגנון | מה עושה | מגבלה |
|---|---|---|
| `absence_cases` | אחראי מסמן היעדרות ו**מעביר לטיפול מחלקה אחרת** (`assigned_department_id`) | ההעברה היא למחלקה, לא לאדם ספציפי |
| התראת סף חיסורים (cron 06:00) | 5+ חיסורים ב-30 יום → התראה **לכל עובדי המחלקה** של התלמידה | לא מגיע לרופאה/פסיכולוגית אלא אם הן במחלקה |
| `student_alerts` | התראה ידנית מסוג `attendance` / `discipline` / `medical` | ידני |
| לוח "בסיכון" | `/api/education/at-risk` | תצוגה, לא התראה |

**המסקנה:** הכיוון "לימודים → חינוך" עובד. הכיוון **"לימודים → רפואה/פסיכולוגיה" אוטומטית לא קיים**.

### 13.4 העברת "רק מה שצריך" בלי לחשוף מידע רגיש — **חלקית**

**מה כן אפשר היום:**
- ✅ **הפניה חלקית**: הרופאה מקבלת גישה למועמדת שהופנתה **בלבד** — לא לכל מאגר התלמידות.
- ✅ **התראה רגישה**: התראה מסומנת `is_sensitive` נראית רק למי שיש `view_sensitive_alerts` — כך אפשר לפתוח לצוות חינוכי התראה "יש בעיה, טפלו" בלי שיראו מה הבעיה הרפואית.
- ✅ **הסתרת שדות PII**: `redactSensitivePerson`.
- ✅ **הרשאות אישיות זמניות**: `person_privileges` עם `expires_at`.
- ✅ **גישה נקודתית לכספים**: `finance_access_grants` עם `scope='journey'` — מודל מצוין של "רק תלמידה אחת". **זהו התקדים היחיד במערכת של הרשאה פר-רשומה.**

**מה חסר:**
- ❌ אין **"שיתוף רשומה" מפורש** — הרופאה לא יכולה לומר "אני משתפת את השורה הזו עם מנהלת הפנימייה בלבד".
- ❌ אין **סיכום מסונן**: אין מנגנון שמייצר "תמצית ללא פרטים רגישים" להעברה לגורם אחר.
- ❌ הרחבת `finance_access_grants` לרפואה/פסיכולוגיה **לא נעשתה** — למרות שהתשתית מוכיחה שזה אפשרי.

---

## 14. פנימייה ומגורים

**מיגרציה**: `20260707120000_dormitory.sql` · **מסכים**: `/dashboard/dormitory`, `/dashboard/dormitory/[id]`
**APIs**: 7 routes

| ישות | טבלה | שדות |
|---|---|---|
| בניין | `dorm_buildings` | שם, קוד, **מגדר** (`male`/`female`/`mixed`), כתובת, הערות, פעיל |
| חדר | `dorm_rooms` | בניין, מספר חדר, **קומה**, **קיבולת**, הערות, פעיל · `UNIQUE(building_id, room_number)` |
| שיבוץ | `dorm_assignments` | חדר, `journey_id`, מתאריך, עד תאריך, סטטוס `active`/`ended` |

**מה עובד:**
- ✅ מגורי תלמידות — שיבוץ לחדר, תאריכים, היסטוריה (שיבוץ שהסתיים נשמר עם `status='ended'`)
- ✅ אזורי מגורים — דרך בניינים
- ✅ חדרים עם קיבולת + **חישוב תפוסה** (`lib/dormitory/occupancy.ts`, מכוסה בטסטים) + מניעת הזמנה כפולה (אינדקס חלקי `idx_dorm_assignments_active_journey`)
- ✅ קישור לתהליך הקבלה — שלב `dormitory` עם חתימת `dorm_director` + דגל `needs_dormitory`
- ✅ קישור לאחזקה — `maintenance_requests.building_id` / `room_id`
- ✅ קישור לביטחון — `security_incidents.building_id`
- ✅ דוח פנימייה — `/api/reports/dormitory`

**מה חסר:**
| נדרש | מצב |
|---|---|
| **אמהות בית / מחנכות משויכות לבניין או לתלמידה** | ❌ אין ישות כזו. יש תפקיד `embait` ו-`dorm_director` ויש `staff_positions.is_head` על מחלקה, אבל **אין קשר "אמא בית X אחראית על בניין Y / על תלמידות Z"** |
| **מגורי אורחים / דירות אורחים** | ❌ אין. גריפ על `guest` לא מחזיר שום ישות מגורים |
| מיטות (bed-level) | ❌ אין — הרזולוציה היא חדר, לא מיטה |
| בקשות החלפת חדר | ❌ אין |
| ציוד/מלאי בחדר | ❌ אין |

---

## 15. ביטחון וגישה פיזית

### 15.1 מה קיים
**מיגרציה**: `20260708130000_security.sql` · **מסך**: `/dashboard/security`, `/dashboard/security/[id]`

**טבלה יחידה**: `security_incidents`
- `occurred_at`, `building_id` (→ `dorm_buildings`), `location_text` (טקסט חופשי)
- `category`: גניבה / ונדליזם / הסגת גבול / עימות / שריפה / רפואי / נזק לרכוש / אחר
- `severity`: `low` / `medium` / `high` / `critical`
- `status`: `open` → `investigating` → `resolved` → `closed` (מעברים תקפים ב-`lib/security/incidents.ts`, מכוסה בטסטים)
- `reported_by`, `assigned_to`, `resolution`, `resolved_at`

**APIs**: `/api/security/incidents`, `/api/security/stats`, `/api/security/buildings`, `/api/reports/security`

**אנשי ביטחון**: תפקידים `security_head`, `security_guard` + הרשאות `security.view` / `security.manage`.
בקטלוג ההרשאות קיימות גם `security.manage_access` ו-`security.view_logs` (מסיד `002`) — **אך שום קוד לא בודק אותן.**

### 15.2 ⚠ מה **לא** קיים — סרקתי במפורש
ביצעתי חיפוש רוחבי על: `access_card`, `keycard`, `badge`, `turnstile`, "כרטיס כניסה", "пропуск"
בכל הקוד, ה-SQL, ה-UI וקבצי התרגום.

**התוצאה: אפס תוצאות רלוונטיות.** לפיכך:

| נדרש | מצב |
|---|---|
| כרטיסי כניסה | ❌ אין שום קוד |
| הרשאות כניסה לאזורים | ❌ אין |
| אזור אדמיניסטרטיבי / לימודים / מגורים / כיתות / טכני / אורחים כאזורי גישה | ❌ אין. יש `buildings`+`rooms` ללימודים ו-`dorm_buildings`+`dorm_rooms` לפנימייה — **שתי היררכיות נפרדות, ללא מושג "אזור גישה"** |
| מידע ביטחוני בתיק אדם | ❌ אין שדה כזה ב-`persons` ולא פאנל בתיק |
| אינטגרציה עם מערכת בקרת כניסה | ❌ אין, ואין גם תשתית מוכנה |
| הרשאות צפייה במידע ביטחוני | ⚠ ברמת המודול בלבד (`security.view`) — אין רמות סיווג |

**מסקנה לסעיף 15:** קיים **יומן אירועי ביטחון בלבד**. תחום הגישה הפיזית **טרם פותח**.

---

## 16. שכר לימוד וכספים

### 16.1 שכר לימוד לתלמידות

**מיגרציות**: `20260705190000_finance_billing.sql`, `20260719120000_finance_tuition.sql`, `20260903130000_tuition_settings_and_discounts.sql`

**מודל הנתונים:**
```
finance_settings (singleton — ניתן לעריכה מה-UI)
  default_year_tuition = 520,000  ·  default_semester_tuition = 260,000
  currency = 'RUB'  ·  default_discount_percent = 90
        │
semesters (year_label, term_number, name, PRICE, status open/closed)
        │
semester_enrollments (semester_id + journey_id)  →  יוצר חיוב
        │
finance_charges (journey_id, semester_id, category='tuition'|'other', amount)
        ├── finance_discounts (percent, amount, reason, + חתימה דיגיטלית מלאה)
        └── finance_payments (amount, method, deposited_to, from_account, to_account, + חתימה)
```

| שאלה שנשאלה | תשובה מהקוד |
|---|---|
| הגדרת שכ״ל לפי שנה וסמסטר | ✅ `semesters(year_label, term_number, price)` + ברירות מחדל ב-`finance_settings` |
| המחיר המלא לתלמידה | ✅ `finance_charges.amount` (נגזר ממחיר הסמסטר בעת השיוך) |
| הנחות באחוז | ✅ `finance_discounts.percent` (0–100) |
| הנחות בסכום | ✅ `finance_discounts.amount` (הסכום המחושב נשמר בנפרד) |
| המחיר הסופי אחרי הנחה | ✅ מחושב: `amount − Σdiscounts` (`lib/finance/money.ts`, מכוסה בטסטים) |
| תשלומים שבוצעו | ✅ `finance_payments` + **אישור תשלום** (`/api/finance/payments/[id]/approve`) |
| יתרת חוב | ✅ `charged − discounts − payments` |
| היסטוריית תשלומים | ✅ `/api/finance/journeys/[id]/ledger` — כרטסת מלאה |
| סטטוס כספי של תלמידה | ✅ `StudentFinancePanel` + `/dashboard/finance/[id]` |
| קבלה | ✅ `/dashboard/finance/receipt/[paymentId]` |
| רשימת חייבות | ✅ `/dashboard/finance` עם מסנן "חייבות בלבד" + ייצוא CSV |
| התראות פיגור | ✅ `POST /api/finance/overdue-alerts/sync` (`lib/finance/overdue.ts`, מכוסה בטסטים) |
| דוח כספי מסכם | ✅ `/api/reports/finance`: חויב / נגבה / יתרה / אחוז גבייה / מספר חייבות |

**חתימה דיגיטלית על כסף** — גם הנחה וגם תשלום נושאים חתימה מלאה
(`signed_by`, `signer_name`, `signature_kind` typed/drawn, `typed_name`, `drawing_path`, `signed_at`)
לפי אותו דגם של חתימות ועדת הקבלה.

**גישה נפרדת לכספים** — `finance_access_grants`:
> "הגישה לכספים **נפרדת** מהגישה לתיק התלמידה. המנהל נותן לעובד גישה לכספים של **כל**
> התלמידות או של **תלמידה אחת ספציפית**. התלמידה בפורטל **לא** רואה כספים עד שהמנהל מרשה לה אישית."
>
> `scope='all'` או `scope='journey'` + `journey_id`. מסך: `/dashboard/finance/access`.

**⚠ פער אחד**: `tuition_discount_approvals` (טבלת governance לאישור הנחת 90%) קיימת, וההרשאות
`approve_discount` / `confirm_payment` **רשומות בקטלוג אך לא ניתנו לאף תפקיד** — במיגרציה כתוב
במפורש שהבעלים יחליט מי אחראי הכספים (§6.2 פתוח). כלומר: **המסך קיים, הזרימה חסומה עד להחלטה ארגונית.**

### 16.2 שכר עובדים — מודול נוסף שלא נשאלת עליו אך קיים במלואו

**מיגרציות**: `20260719140000_staff_compensation.sql`, `20260720160000_teacher_monthly_pay.sql`

```
staff_compensation (תעריפים אישיים פר-עובד)
   hourly_rate · chavruta_rate · chavruta_plus_rate + basis (per_student_month | per_hour)
        │
staff_work_entries (יומן עבודה מאוחד)
   entry_type: teaching | meeting | chavruta | chavruta_plus |
               shabbat_host | shabbat_family | monthly | other
   summary (נראה לפי כללים) · private_notes (לעולם לא לתלמידה)
        │
staff_payslips (תלוש חודשי — המנהל מאשר)
```
**יצירה אוטומטית**: `/api/staff-comp/[personId]/generate-teaching` (מהשיעורים שנלמדו),
`generate-monthly` (לפי `class_teachers.monthly_rate`), `generate-chavruta-plus`.
כולן **אידמפוטנטיות** — אינדקסים ייחודיים מונעים חיוב כפול.
**מסכים**: `/dashboard/finance/staff`, `/dashboard/finance/staff/[personId]`, `/dashboard/finance/staff/chavruta`.

---

## 17. הרשאות ואבטחת מידע

### 17.1 מודל ההרשאות

```
persons ──→ person_roles ──→ roles ──→ role_privileges
                                        (module, privilege_code, scope)
   │                                              ▲
   └──→ person_privileges ────────────────────────┘  (דריסה אישית: grant / deny + expires_at)

module_privileges = הקטלוג של כל ההרשאות האפשריות (module + privilege_code)
```

**Roles** — כ-42 קודי תפקיד מוזרעים במיגרציות:
`superadmin`, `tech_admin`, `campus_president`, `president_secretary`, `finance_director`,
`accountant`, `lawyer`, `hr_director`, `rector`, `dean`, `school_director`, `vice_director`,
`dept_head`, `program_head`, `teacher`, `curator`, `student`, `pupil`, `dorm_director`,
`embait`, `mashgiach`, `doctor`, `psychologist`, `security_head`, `security_guard`,
`maintenance_head`, `maintenance_staff`, `kitchen_head`, `kitchen_staff`, `technical_staff`,
`applicant`, `alumni`, `sponsor`, `head_of_studies`, `jewishness_officer`, `recruiter`,
`studies_manager`, `studies_secretary`, `unit_manager`, `unit_secretary`,
`jewish_studies_manager`, `jewish_studies_rav`.

**Modules** (19): `persons`, `applicants`, `education`, `jewishness`, `finance`, `dormitory`,
`food`, `maintenance`, `security`, `doctor`, `psychologist`, `alumni`, `sponsors`, `tasks`,
`documents`, `reports`, `settings`, `contacts`, `chavruta`
\+ שלושה מודולים שנוספו בפיצול מטריצת החינוך: `recruitment`, `admission`, `studies`
(מיגרציה `20260819120000_split_education_matrix_modules.sql`).

### 17.2 שלוש רמות ההרשאה

| רמה | דוגמה | מימוש |
|---|---|---|
| **1. גישה למודול** | `module='finance', privilege_code='access'` | נבדק ב-`middleware.ts` לפני שהדף בכלל נטען |
| **2. פעולה בתוך מודול** | `manage_students`, `mark_attendance`, `set_grades`, `approve_kodesh_teacher` | נבדק בכל route |
| **3. Scope (היקף רשומות)** | `all` / `department` / `own` | `lib/permissions/scope.ts` + `lib/education/permissions.ts` |

**מה זה `scope` בפועל:**
- `all` — כל הרשומות במוסד
- `department` — רק המחלקה של המשתמש **ועץ המחלקות שמתחתיה** (`expandDepartmentTree`)
- `own` — רק רשומות שהמשתמש אחראי עליהן (למשל: `class_teachers` של קבוצה, `teacher_id` של שיעור)

**הרשאות "דקות" בחינוך** (`EducationPrivilege` ב-`lib/education/permissions.ts`) — 26 קודים:
`manage_subjects`, `manage_specialties`, `manage_study_groups`, `view_leads`, `manage_leads`,
`convert_lead`, `view_applicants`, `manage_applicants`, `enroll_applicant`, `view_students`,
`manage_students`, `manage_enrollments`, `manage_class_groups`, `manage_class_teachers`,
`mark_attendance`, `set_grades`, `set_lesson_topics`, `manage_communities`, `write_evaluation`,
`manage_tracks`, `create_kodesh_course`, `approve_kodesh_teacher`, `set_teacher_quota`,
`jewishness_initial_check`, `jewishness_final_approve`, `manage_alerts`, `view_sensitive_alerts`.

### 17.3 הרשאות ברמת רשומה — **קיימות, אך רק בשלושה מקומות**
1. **`finance_access_grants`** — `scope='journey'` → גישה לכספים של **תלמידה אחת**. המודל המפורש היחיד.
2. **`education_journeys.finance_visible_to_student`** — האם התלמידה רואה את הכספים שלה.
3. **`student_alerts.is_sensitive`** — התראה רגישה נראית רק עם `view_sensitive_alerts`.

**בכל שאר המערכת ההרשאה היא מודול + פעולה + scope — לא פר-רשומה.**

### 17.4 מי רואה מה בתיק האישי

| חלק בתיק | מי רואה |
|---|---|
| נתונים אישיים בסיסיים (שם, טלפון, אימייל) | כל מי שיש לו `persons.view` |
| **דרכון, כתובת, אזרחות, מצב משפחתי, תאריך לידה** | **רק** `persons.view_sensitive` — אחרת מוחזר `null` (`lib/persons/redact.ts`) |
| טאב "לימודים" | `view_students` בהיקף המחלקה של המסלול |
| כספים | `finance.view` **+** `finance_access_grants` |
| מסמכים | `documents.view` + גישה למסלול |
| רפואי | **רק** `doctor.view` / `doctor.manage` — לא מופיע כלל בתיק החינוכי |
| פסיכולוגי | **רק** `psychologist.view` / `psychologist.manage` |
| התראות רגישות | `view_sensitive_alerts` |
| חוות דעת | `view_students` לקריאה; `manage_students` **או** `write_evaluation` לכתיבה |
| `private_notes` (חברותא/שבת) | צוות בלבד — לעולם לא לתלמידה |

### 17.5 האם ניתן להגדיר מי רשאי לראות הערה מסוימת? — **לא (למעט דגל בינארי)**
כפי שפורט בסעיף 12.2: אין שדה נראות ברמת ההערה. הדבר הקרוב ביותר הוא
`student_alerts.is_sensitive` — דגל בינארי המחייב הרשאה נפרדת.

### 17.6 Audit logs — **קיימים ב-DB, אך אין להם ממשק**

**מה קיים** (מיגרציות `20260702170000` + `20260703140000`):
- טבלה `audit_log`: `entity_type`, `entity_id`, `action` (create/update/delete),
  `old_data` (JSONB מלא), `new_data` (JSONB מלא), `changed_fields` (מערך שמות השדות שהשתנו),
  `changed_by`, `changed_at`.
- **טריגר ברמת ה-DB** — לא ניתן "לשכוח" אותו, ותופס **כל** דרך כתיבה (RPC, PostgREST, SQL ישיר).
- מותקן על **8 טבלאות**:
  `persons`, `education_journeys`, `role_privileges`, `person_privileges`,
  `staff_positions`, `staff_profiles`, `process_instances`, `stage_instances`.

**⚠ המגבלות (מתועדות במיגרציה עצמה):**
1. **אין שום מסך ואין שום API שקורא את `audit_log`** — אימתתי בגריפ: אפס תוצאות ב-`app/`, `lib/`, `components/`.
   > **המשמעות:** הנתונים נאספים, אבל כדי לראות "מי שינה מה" צריך להיכנס ל-Supabase ולהריץ SQL ידני.
2. **"מי" (`changed_by`) נרשם רק כשהקוד הכותב הגדיר `app.current_actor_id`** — זה נעשה ב-RPCים
   החדשים (`create_staff_member`, `merge_persons`, `create_application`), אך **לא** בכתיבות
   PostgREST רגילות. במקרים כאלה `changed_by = NULL` — הרשומה נשמרת, אך בלי זהות המשנה.
3. **`tasks` לא מבוקרת** במודע (נפח שינויים גבוה).
4. **אין תיעוד של צפייה** — רק של שינוי. **אי אפשר לדעת מי צפה במידע רגיש.**

### 17.7 האם האכיפה בצד השרת? — **כן, וזה מאומת בטסט אוטומטי**

1. **RLS מכובה בכוונה** בכל הפרויקט — השרת עובד עם service key. **כל האכיפה היא בשכבת ה-API.**
2. **`middleware.ts`** (170 שורות) — רץ לפני כל בקשה:
   - חוסם דפי מודול לפי `role_privileges.access` **וגם** לפי `person_privileges` (דריסות אישיות)
   - מפריד לחלוטין בין פורטל תלמידה (`principal='student'`) לבין דשבורד צוות
   - **מצב "צפייה כמשתמש" הוא קריאה-בלבד**: כל בקשת POST/PUT/PATCH/DELETE נחסמת ב-403
3. **`lib/api/route-authorization.test.ts`** — **שומר אוטומטי**:
   > כל `route.ts` שאינו ציבורי **חייב** להכיל בדיקת הרשאה. שתי דרגות:
   > **Tier 1** — כל route חייב לפחות פרימיטיב אימות אחד.
   > **Tier 2** — route של מודול רגיש (doctor, psychologist, finance, jewishness, sponsors,
   > documents, persons, dormitory, food, security, maintenance, reports, contacts, staff,
   > staff-comp, quality-control, settings, alumni, education, applicants) חייב בדיקת
   > **הרשאה/תפקיד** מעבר לעצם ההתחברות.
   > הטסט **מפיל את הבנייה** אם מישהו יוסיף route בלי בדיקה.
4. **`lib/auth/permission-gates.test.ts`** — מוודא ששער בלי הרשאה מחזיר 403 (ובלי סשן 401), ושה-superadmin עובר.
5. **`lib/education/portal-isolation.test.ts`** — מוודא שתלמידה A לא יכולה לגשת לנתוני תלמידה B.
6. **fail-closed** — ברירת המחדל בכל מקום היא חסימה.

### 17.8 אבטחה נוספת
| נושא | מצב |
|---|---|
| סיסמאות | `bcryptjs`, בדיקת חוזק (`lib/auth/password-strength.test.ts`), חובת החלפה בכניסה ראשונה (`must_change_password`) |
| JWT | `jose` HS256, cookie `campus_session` httpOnly + secure בפרודקשן + sameSite lax |
| `JWT_SECRET` | **בפרודקשן האפליקציה קורסת בכוונה** אם חסר או חלש (fail-closed, `lib/auth/config.ts`) |
| הפרדת כניסות | תלמידה ב-`student_credentials` — טבלה נפרדת לגמרי מ-`person_accounts`. כניסת צוות **פיזית לא יכולה** לאמת תלמידה ולהפך |
| `/api/dev-login` | חסום ב-403 כשלא `NODE_ENV=development` |
| cron | מוגן ב-`CRON_SECRET` (אם לא מוגדר — ה-endpoint פתוח ⚠) |
| קבצים | בקט פרטי + signed URLs בלבד; נתיב חתימות מוגן מפני IDOR |
| חיפוש | סניטציה של קלט (`lib/search/sanitize.ts`) |
| טופס ציבורי | honeypot + rate limit |
| ניטור | Sentry עם `sendDefaultPii: false` (בלי מיילים/טלפונים ב-traces) |

---

## 18. אינטגרציות

| שירות | סטטוס | פרטים |
|---|---|---|
| **Supabase (PostgreSQL)** | ✅ פעיל | בסיס הנתונים הראשי. RLS מכובה — גישה דרך service key |
| **Supabase Storage** | ✅ פעיל | בקט פרטי `documents` למסמכים ולחתימות |
| **Vercel** | ✅ פעיל | אירוח + פריסה אוטומטית מ-`main` |
| **Vercel Cron** | ✅ פעיל | 2 עבודות: תזכורות (06:00), ייצור שיעורים (03:00) |
| **Sentry** | ⚠ הקוד מוכן, כבוי | `sentry.{client,server,edge}.config.ts` + `instrumentation.ts`. **בלי DSN הכל no-op.** נדרש: הקמת פרויקט + הגדרת `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` ב-Vercel |
| **Web Push (PWA)** | ✅ מיושם | מפתחות VAPID **נוצרים אוטומטית** ונשמרים ב-`app_settings` — **בלי צורך בהגדרה ידנית**. Service worker: `public/sw.js`. מנויים נשמרים פר-אדם. מחובר ל-`lib/notifications/create.ts` |
| **Google Calendar (יוצא)** | ✅ מיושם | פיד ICS חתום (`/api/public/calendar-feed`) + כפתור `GoogleCalendarLink` |
| **WhatsApp** | ✅ קישורים בלבד | `wa.me` deep-links מכל טלפון במערכת (`components/ui/PhoneLink.tsx`). **אין API אמיתי** |
| **GitHub Actions** | ✅ פעיל | CI: type-check + lint + tests + build בכל push/PR |
| **Playwright E2E** | ⚠ מוכן, לא פעיל | 3 spec-ים. רץ רק אם מוגדר secret בשם `STAGING_URL` — **טרם הוגדר**, לכן ה-workflow מדלג |
| **מייל יוצא (SMTP/SendGrid/Mailgun)** | ❌ אין | אימות: גריפ החזיר אפס |
| **SMS** | ❌ אין | |
| **סליקה/תשלומים (Stripe/PayPal)** | ❌ אין | התשלומים נרשמים ידנית |
| **מערכת בקרת כניסה** | ❌ אין | ראה סעיף 15 |
| **מערכת חשבונאות חיצונית** | ❌ אין | |

---

## 19. תשתית טכנית

| רכיב | פרטים |
|---|---|
| **Framework** | Next.js 14.2.35, App Router, React 18.3, TypeScript 5.6.3 |
| **עיצוב** | Tailwind CSS 4 + CSS variables (תמיכה מלאה ב-dark mode) + RTL |
| **בסיס נתונים** | Supabase PostgreSQL. **RLS מכובה בכוונה** — service key בשרת |
| **הרצת מיגרציות** | **ידנית** ב-Supabase SQL Editor, לפי סדר שם הקובץ. אין הרצה אוטומטית. טסט `lib/migrations/hygiene.test.ts` מוודא שאין שתי מיגרציות עם אותו prefix |
| **אימות** | JWT מותאם אישית (`jose` HS256) + `bcryptjs`. **לא** Supabase Auth |
| **אחסון קבצים** | Supabase Storage, בקט פרטי `documents`, גישה דרך signed URLs |
| **API** | 336 Next.js route handlers. ולידציה: Zod. שגיאות: `lib/api/handler.ts` — מיפוי אחיד של שגיאות Postgres ל-HTTP |
| **פאגינציה** | `fetchAllPages` / `pageAll` — PostgREST חותך ב-~1000 שורות; העוזר קורא את כל העמודים |
| **עבודות רקע** | Vercel Cron ×2. תזכורות מתממשות גם בעת פתיחת הפעמון (בלי תלות בתזמון חיצוני) |
| **פריסה** | Vercel מ-`Machonadmin/CampusSystem` ענף `main` |
| **ניטור** | Sentry (קוד מוכן, DSN טרם הוגדר) |
| **i18n** | מערכת עצמית: `messages/{he,en,ru}.json` — 4,649 מפתחות בכל שפה. שגיאות שרת מתורגמות דרך `serverT()` לפי cookie `campus_locale`. טסט זהות מפתחות אוטומטי |
| **PWA** | `manifest.webmanifest` + `public/sw.js` + אייקונים 192/512 |
| **משתני סביבה** | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET` (חובה); `CRON_SECRET` (מומלץ); Sentry (אופציונלי). בדיקה: `scripts/check-env.mjs` |
| **כלים תפעוליים** | `scripts/verify-migrations.mjs` (מוודא שכל המיגרציות הוחלו), `scripts/build-staging-bootstrap.sh`, `scripts/create-admin.ts` |

---

## 20. בדיקות ואיכות

### 20.1 תוצאות שהרצתי בפועל על ה-commit הזה

| בדיקה | פקודה | תוצאה |
|---|---|---|
| **TypeScript** | `npx tsc --noEmit` | ✅ **0 שגיאות** |
| **Lint** | `npm run lint` | ✅ **0 שגיאות**, 7 אזהרות (כולן `<img>` במקום `next/image` — אזהרות ביצועים בלבד) |
| **טסטים** | `npm test` | ✅ **779 טסטים ב-69 קבצים — כולם עוברים** (11.6 שניות) |
| **בנייה** | `npm run build` | ✅ **הצליחה** — כל 88 המסכים נבנו |

### 20.2 מה הטסטים מכסים

**69 קבצי טסט, כולם `vitest` — טסטים של לוגיקה טהורה (בלי DB, בלי רשת).**

| תחום | קבצים | מה נבדק |
|---|---|---|
| **אבטחה והרשאות** | `route-authorization`, `permission-gates`, `scope`, `module-factory`, `stage-access`, `portal-isolation`, `portal-access`, `redact` | שכל route מוגן; ש-403/401 מוחזרים נכון; חישוב scope; שתלמידה לא רואה תלמידה אחרת; הסתרת PII |
| **חינוך** | 20 קבצים | חישוב חיסורים, חלון נוכחות, ייצור שיעורים, התנגשויות שיבוץ, ימים ללא לימודים, מכסות מורים, בדיקות קורס, חריגות קודש, ניווט |
| **כספים** | 6 קבצים | חישובי כסף (באגורות), פיגורים, ולידציה, שכר עובדים |
| **workflow** | 3 קבצים | ולידציית חתימה, אחסון חתימה, סמכות חותם |
| **יומן** | 6 קבצים | רשת חודשית, חפיפות, תאריך עברי, ICS, ימי הולדת |
| **אנשים** | 2 קבצים | זיהוי כפילויות, הסתרת שדות |
| **תשתית** | `messages-parity`, `parity`, `hygiene`, `dates`, `csv`, `csv-parse`, `useSafeBack`, `url-tab` | זהות מפתחות i18n; ייחודיות prefix של מיגרציות; פורמט תאריכים |
| **מודולים** | doctor, psychologist, dormitory, food, maintenance, security, sponsors, documents, contacts, reports, tasks, chavruta, admission, jewishness | חישובים וסטטוסים |

**E2E**: 3 spec-ים של Playwright (`e2e/auth.spec.ts`, `login.spec.ts`, `education-nav.spec.ts`).
⚠ **הם לא רצים** — ה-workflow מדלג עליהם כי לא הוגדר secret `STAGING_URL`.

### 20.3 ⚠ מה **הוכח** בבדיקות אוטומטיות מול מה שדורש בדיקת משתמש אמיתי

**מה הוכח אוטומטית:**
- ✅ הקוד מתקמפל, נבנה ועובר lint
- ✅ כל חישובי הלוגיקה נכונים (כסף, נוכחות, תאריכים, התנגשויות, scope)
- ✅ **כל route מוגן בבדיקת הרשאה** — זה מאומת סטטית על כל 336 ה-routes
- ✅ שערי ההרשאה מחזירים 403/401 נכון
- ✅ בידוד הפורטל בין תלמידות
- ✅ זהות מפתחות התרגום בין 3 שפות
- ✅ אין שתי מיגרציות עם אותו סדר

**מה עדיין דורש בדיקת משתמש אמיתי — וזה משמעותי:**
- ❌ **אין ולו טסט אחד שמריץ בסיס נתונים אמיתי.** כל 779 הטסטים מדמים את Supabase.
- ❌ **אין טסטים ל-RPCים ב-PL/pgSQL** — `complete_stage` (~300 שורות), `start_process`, `merge_persons`, `advance_academic_year`, `create_staff_member`, `transition_education_status`, `acceptance_apply_dormitory_gating`. הקוד עצמו מציין: *"אי אפשר לבדוק SQL מקומית"*.
- ❌ **אין טסטים לרכיבי UI** — אף לא אחד מ-73 הרכיבים.
- ❌ **אין טסטי אינטגרציה של API** מקצה לקצה.
- ❌ **לא ניתן לדעת מהקוד אילו מיגרציות הורצו בפועל ב-Supabase.** הן מורצות ידנית. יש כלי (`scripts/verify-migrations.mjs`) אך יש להריץ אותו כדי לדעת.
- ❌ **תהליך הקבלה מעולם לא נבדק מקצה לקצה בפרודקשן** ע"י 4–5 חותמים אמיתיים.
- ❌ **E2E לא רץ** — אין ולו בדיקה אחת מול מערכת חיה.

---

## 21. מה נגיש היום למשתמש

**הבהרה חשובה:** "נגיש" = הקוד קיים, המסך נבנה, ה-route מוגן, וה-build עובר.
**זה לא אומר שהמיגרציה המתאימה הורצה ב-Supabase** — יש לוודא זאת בכלי `verify-migrations.mjs`.

### 21.1 מוכן לבדיקת משתמש אמיתי

| מסך | Route | תפקיד נדרש | כניסה מ- | מה אפשר לעשות |
|---|---|---|---|---|
| **כניסה** | `/login` | — | ישיר | כניסה, החלפת סיסמה, בחירת שפה |
| **בית** | `/dashboard` | כל עובד | אחרי כניסה | רשת מודולים, סדר יום, וידג'טים |
| **יומן אישי** | `/dashboard/calendar` | כל עובד | תפריט | פגישות, אירועים, ימי חסימה, שיעורים, משימות, חיבור ל-Google |
| **משימות** | `/dashboard/tasks` | `tasks.view_own`/`view_all` | תפריט | יצירה, הקצאה, פול מחלקתי, תגובות, סטטוסים |
| **גיוס** | `/dashboard/education/recruitment` | `recruiter` / `view_leads` | חינוך → גיוס | רשימת לידים, כרטיס, קידום תהליך, העברה לוועדה |
| **ועדת קבלה** | `/dashboard/education/admission` | `head_of_studies` / `dorm_director` / `jewishness_officer` / `school_director` | חינוך → קבלה | חתימה על השלב שלך, צפייה בסטטוס |
| **בירור יהדות** | `/dashboard/jewishness` | `jewishness_officer` / `jewish_studies_manager` | תפריט | תור בדיקה, מסמכים, בדיקה ראשונית (משה) + אישור סופי (חנה) |
| **פנימייה** | `/dashboard/dormitory` | `dorm_director` / `dormitory.view` | תפריט | בניינים, חדרים, שיבוץ, תפוסה |
| **מטבח** | `/dashboard/food` | `kitchen_head` / `food.view` | תפריט | תוכניות ארוחה, רישום, פרופיל תזונתי |
| **אחזקה** | `/dashboard/maintenance` | `maintenance_head` / `maintenance.view` | תפריט | קריאות שירות, שיוך, סטטוס |
| **ביטחון** | `/dashboard/security` | `security_head` / `security.view` | תפריט | יומן אירועים, סטטיסטיקות |
| **רופאה** | `/dashboard/doctor` | `doctor` | תפריט → בריאות | תיקים, ביקורים, הפניות, חתימה |
| **פסיכולוגית** | `/dashboard/psychologist` | `psychologist` | תפריט → בריאות | תיקים, פגישות, מעקב |
| **אנשי קשר** | `/dashboard/contacts` | `contacts.view` | תפריט | ספריית ארגונים |
| **אנשים** | `/dashboard/persons` | `persons.view` | תפריט | חיפוש, כרטיס, כפילויות, מיזוג |
| **צוות** | `/dashboard/staff` | `persons.create` | תפריט | קליטה, משרות, סיום, בדיקת scope |
| **תורמים** | `/dashboard/sponsors` | `sponsors.view` | תפריט | תורמים ותרומות |
| **בוגרות** | `/dashboard/alumni` | `alumni.view` | תפריט | פרופילי בוגרות |
| **מסמכים** | `/dashboard/documents` | `documents.view` | תפריט | מסמכי תלמידות, פגי תוקף |
| **דוחות** | `/dashboard/reports` | `reports.view` | תפריט | 11 דוחות מסכמים |
| **הגדרות** | `/dashboard/settings` | `superadmin` | תפריט | תפקידים, הרשאות, משתמשים, תפקידים, ערים, workflows |
| **פורטל תלמידה** | `/portal` | תלמידה עם `student_credentials` | `/portal/login` | הודעות, לוח מחוונים, יומן, ציונים, חברותא, שבתות, סקר, פגישות |
| **טופס ציבורי** | `/apply` | **ללא כניסה** | קישור ישיר | הגשת בקשה |

### 21.2 נגיש, אך דורש הכנת נתונים לפני שיהיה שימושי

| מסך | מה מונע |
|---|---|
| `/dashboard/education/studies` | דורש שכבר הוגדרו מסלולים, שנים, סמסטרים, קבוצות וקורסים. על DB ריק — מסך ריק |
| `/dashboard/education/timetable` | דורש קבוצות + מורים + כיתות |
| `/dashboard/education/kodesh*` | דורש שרמות הקודש הוזרעו לפי המבנה החדש (6 רמות / 8 קבוצות) |
| `/dashboard/finance` | דורש שהוגדרו סמסטרים עם מחירים |
| `/dashboard/finance/staff` | דורש תעריפים אישיים לכל עובד |
| `/dashboard/quality-control` | דורש תבניות בדיקה |
| `/dashboard/education/teaching-surveys` | דורש סקר פתוח עם שאלות |

### 21.3 ⚠ לא נגיש — קיים אך אין דרך להגיע אליו מהממשק

| יכולת | למה |
|---|---|
| **מסלול ביקורת (`audit_log`)** | אין מסך ואין API. רק SQL ידני ב-Supabase |
| **שכר עובדים** (`/dashboard/finance/staff`) | הדף קיים ועובד, אבל **אין קישור אליו מהתפריט הראשי** — צריך להקליד את הכתובת |
| **אישורי הנחה** (`tuition_discount_approvals`) | ההרשאות `approve_discount`/`confirm_payment` **לא ניתנו לאף תפקיד** — חסום עד להחלטה ארגונית |
| **פוש לנייד** | עובד, אבל צריך שהמשתמש יתקין את ה-PWA ויאשר התראות — אין הכוונה בממשק |

---

## 22. מה כבר בנוי אבל עדיין "מסתתר"

זהו הסעיף שממפה את היקף העבודה שנעשתה במקומות שאינם נראים.

### 22.1 קיים במלואו ב-DB וב-API — אך ללא ממשק כלל

| יכולת | היכן | מה יש | מה חסר |
|---|---|---|---|
| **מסלול ביקורת מלא** | `audit_log` + טריגר על 8 טבלאות | כל שינוי ב-`persons`, `education_journeys`, ההרשאות, המשרות והתהליכים — עם הערכים המלאים לפני ואחרי | **מסך + API.** אפס קוד קורא את הטבלה |
| **הרשאות ביטחון מפורטות** | `module_privileges` | `security.manage_access`, `security.view_logs` רשומות בקטלוג | שום קוד לא בודק אותן |
| **אישורי הנחת שכ״ל** | `tuition_discount_approvals` + API | טבלת governance מלאה (בקשה → אישור/דחייה) עם אינדקס "בקשה ממתינה אחת פר תלמידה" | ההרשאות לא ניתנו לאף תפקיד; אין חיבור אוטומטי לחיוב בפועל |
| **טבלאות מסמכים legacy** | `document_types`, `document_categories`, `person_documents` | תשתית לתבניות מסמכים ומסמכי אדם (לא רק תלמידה) | שום קוד לא משתמש בהן |

### 22.2 קיים במלואו כולל מסך — אך המסך לא מקושר / לא ידוע

| יכולת | Route | מה יש |
|---|---|---|
| **שכר עובדים ותלושים** | `/dashboard/finance/staff` + `.../[personId]` + `.../chavruta` | תעריפים אישיים, יומן עבודה של 8 סוגים, יצירה אוטומטית מהשיעורים, חישוב חברותא ושבתות, תלוש חודשי לאישור המנהל. **11 API routes.** לא מופיע בתפריט הראשי |
| **בקרת גישה לכספים** | `/dashboard/finance/access` | הענקת גישה לכספי כל התלמידות או של תלמידה אחת |
| **תצוגה מקדימה של scope** | `/api/staff/scope-preview` | מראה למנהל בדיוק אילו תלמידות, מסלולים וקבוצות העובד יראה — **לפני** שנותנים לו את ההרשאה |
| **בדיקת תקינות צוות** | `/api/staff/health` | מזהה עובדים בלי תפקיד/משרה |
| **"צפייה כמשתמש"** | `/api/auth/impersonate` | הבעלים רואה את המערכת בעיניים של עובד — אותו תפריט, אותן הרשאות. **קריאה בלבד** (כל שינוי נחסם ב-middleware) |

### 22.3 תשתיות משמעותיות שנבנו ופועלות ברקע

| יכולת | פרטים |
|---|---|
| **פוש-נוטיפיקציות לנייד** | מפתחות VAPID נוצרים אוטומטית ונשמרים ב-`app_settings` — **בלי צורך בהגדרת env**. Service worker, מנויים פר-מכשיר, ניקוי מנויים מתים. מחובר לכל התראה במערכת |
| **פיד יומן ICS** | כל עובד יכול לחבר את היומן ל-Google/Outlook עם קישור חתום אישית |
| **ייצור שיעורים אוטומטי** | cron יומי — מייצר שיעורים ממערכת השעות, מדלג על ימים ללא לימודים ועל שיבוצים ממתינים |
| **הסלמת חיסורים לילית** | cron יומי — 5+ חיסורים ב-30 יום → התראה לצוות המחלקה, עם דה-דופליקציה |
| **מעבר שנה אקדמית** | RPC אטומי — קידום שנה + סימון בוגרות, אידמפוטנטי |
| **מנוע workflow גנרי** | `process_templates` → `stage_templates` → `stage_finals`/`transitions`/`task_templates`. **ניתן לעריכה מה-UI** (`/dashboard/settings/workflows`) — אפשר לבנות תהליכים חדשים בלי לכתוב קוד |
| **ייבוא CSV** | ייבוא תלמידות עם מיפוי עמודות (`lib/education/import-map.ts`) |
| **מיזוג רשומות אנשים** | RPC שסורק את כל מפתחות הזרים דינמית — עובד גם על טבלאות שיתווספו בעתיד |
| **i18n מלא** | 4,649 מפתחות × 3 שפות, כולל **שגיאות שרת מתורגמות** — משהו שרוב המערכות לא עושות |
| **Dark mode + RTL מלא** | בכל המסכים |
| **מנגנון "deploy-safe"** | כמעט כל route כתוב כך שאם המיגרציה עוד לא הורצה — הוא מחזיר ריק במקום לקרוס (`42P01` → תשובה ריקה) |

---

## 23. תמונת מוכנות לפי מודול

**מקרא הסטטוסים:**
- **A — עובד ומוכן לבדיקת משתמש**: מסך + API + הרשאות + טסטים; אין תלות חיצונית
- **B — עובד ברובו, דורש השלמות קטנות**
- **C — בנוי חלקית**: חלק מהזרימה קיים
- **D — תשתית קיימת, UI/workflow חסרים**
- **E — טרם פותח**

| # | מודול | סטטוס | על מה הסטטוס מבוסס |
|---|---|---|---|
| 1 | אימות והרשאות | **A** | 336 routes מוגנים (מאומת בטסט סטטי), middleware, 3 רמות הרשאה, טסטי שערים עוברים |
| 2 | אנשים (מאגר) | **A** | 10 APIs, מסכים, זיהוי כפילויות + RPC מיזוג, הסתרת PII מכוסה בטסטים |
| 3 | משימות | **A** | 5 טבלאות, 9 APIs, 2 מסכים, חזרתיות מכוסה בטסטים, חיבור ליומן ולהתראות |
| 4 | יומן | **A** | 8 מקורות מאוחדים, מניעת חפיפה, ICS, 6 קבצי טסט |
| 5 | גיוס (לידים) | **A** | תבנית תהליך במיגרציה, טופס ציבורי, כרטיס ליד, כפתור העברה עם חסימה |
| 6 | ועדת קבלה | **B** | `acceptance_v2` סדרתי, 6 שלבים, חתימות, אכיפת סמכות, גיטינג פנימייה. **חסר: בדיקה מקצה לקצה עם 4 חותמים אמיתיים** |
| 7 | בירור יהדות | **B** | מודול מלא + זרימה דו-שלבית (משה → חנה) + היסטוריה. חסרה בדיקת משתמש |
| 8 | תיק תלמידה | **B** | 8 טאבים + 14 פאנלים + ציר זמן. חסרים: פנימייה/רפואה/מזון בתיק |
| 9 | לימודים (מבנה) | **B** | יחידות, מסלולים, סמסטרים, קורסים, מורים, כיתות. ⚠ טבלת `students` legacy נקראת ב-5 מקומות |
| 10 | מערכת שעות | **B** | שיבוצים, התנגשויות, אישור בזמן קודש, ייצור שיעורים ב-cron |
| 11 | נוכחות | **A** | 3 סטטוסים, משקל מחושב ב-DB, חלון עריכה, מקרי היעדרות, הסלמה לילית — 5 קבצי טסט |
| 12 | ציונים | **B** | מטלות + ציונים + gradebook + ממוצע. **חסר: ציון סופי לקורס** |
| 13 | מחלקת יהדות (קודש) | **B** | רמות, קורסים, מכסות, אישורי מורים, לוח שנה מוטמע, סיידבר ייעודי. נבנה בספטמבר 2026 — טרם נבדק בשטח |
| 14 | פנימייה | **B** | בניינים, חדרים, שיבוץ, תפוסה. **חסרים: אמהות בית, מגורי אורחים** |
| 15 | מטבח | **A** | תוכניות, רישום, תזונה, דוח |
| 16 | אחזקה | **A** | קריאות, שיוך, סטטוסים, מיקומים, דוח |
| 17 | ביטחון (אירועים) | **A** | יומן אירועים מלא עם מעברי סטטוס מכוסים בטסטים |
| 18 | ביטחון (גישה פיזית) | **E** | **אפס קוד.** אין כרטיסים, אין אזורים, אין אינטגרציה |
| 19 | רופאה | **A** | תיקים, ביקורים, הפניות, מעקב — מכוסה בטסטים |
| 20 | פסיכולוגית | **A** | תיקים, פגישות, רמת סיכון, מעקב — מכוסה בטסטים |
| 21 | שכר לימוד | **B** | סמסטרים, חיובים, הנחות בחתימה, תשלומים, יתרות, קבלה, גישה נקודתית. ⚠ אישורי הנחה לא משויכים לתפקיד |
| 22 | שכר עובדים | **D** | מודול מלא (11 APIs, 3 מסכים) — **לא מקושר לתפריט** |
| 23 | מסמכי תלמידה | **B** | Storage פרטי, signed URLs, קטגוריות, סטטוס בדיקה, פגי תוקף. ⚠ שני מנגנונים במקביל |
| 24 | מסמכי עובד / משרד | **E** | לא קיים |
| 25 | חובות אקדמיים | **E** | **אין ישות.** רק תווית התראה ידנית |
| 26 | תורמים | **A** | תורמים, תרומות, סטטוסים, סנכרון, דוח |
| 27 | בוגרות | **A** | פרופיל נוצר אוטומטית בעת "בוגרת" |
| 28 | אנשי קשר | **A** | ספרייה מלאה. ⚠ נפרד מ-`persons` |
| 29 | בקרת איכות | **B** | תבניות עם בלוקים ושאלות + ביצוע. דורש הגדרת תבניות |
| 30 | דוחות | **A** | 11 דוחות (חינוך, כספים, פנימייה, מזון, אחזקה, ביטחון, תורמים, מסמכים, מרפאה, ייעוץ, משפך קבלה) |
| 31 | הגדרות ותפקידים | **A** | עורך תפקידים והרשאות, משתמשים, ערים, תפקידים, עורך workflows |
| 32 | פורטל תלמידה | **B** | 8 פאנלים + כניסה נפרדת + בידוד מכוסה בטסטים. חסרה בדיקת תלמידה אמיתית |
| 33 | חברותא | **A** | שיוך, מפגשים, סיכומים, הפרדת `private_notes` מכוסה בטסטים |
| 34 | סקרי הוראה | **B** | בנייה, פתיחה/סגירה, תשובות, תוצאות. דורש סקר פעיל |
| 35 | התראות (פעמון + פוש) | **A** | טבלה, API, פעמון, פוש אמיתי, תזכורות מתממשות |
| 36 | מסלול ביקורת | **D** | טריגרים על 8 טבלאות פועלים — **אין ממשק** |
| 37 | i18n (3 שפות) | **A** | 4,649 מפתחות × 3, זהות מאומתת בטסט |
| 38 | מנוע workflow | **A** | גנרי, ניתן לעריכה מה-UI, RPCים אטומיים |

---

## 24. הדרך המהירה ביותר להתחיל להשתמש במערכת

בחרתי 5 חלקים שהם **הכי קרובים למסירה לעובדי המכון**, לפי הקריטריון: מעט תלויות,
ערך מיידי, ולא דורשים החלטות ארגוניות גדולות.

---

### ① משימות + יומן — **הכי קרוב למסירה**

**מה כבר מוכן:** מערכת משימות מלאה (יצירה, הקצאה לאדם/מחלקה/תפקיד, פול, מועדים, 7 סטטוסים,
עדיפויות, תגובות, צופים, היסטוריה, משימות חוזרות) + יומן אישי שמאחד 8 מקורות + התראות + פוש + ICS.

**מה נשאר להשלים:** כלום מהותי. אולי הדרכה קצרה על "מה זה פול מחלקתי".

**מה צריך לבדוק עם המשתמשים:** האם ההפרדה בין "משימה שלי" ל"משימה של המחלקה" ברורה;
האם התזכורות מגיעות בזמן הנכון.

**תלויות/חסמים:** אין. **צריך רק חשבונות עובדים ומחלקות מוגדרות.**

**מי יכול להתחיל ראשון:** **כל הצוות המנהלי** — מזכירות, אחראי מחלקות, הנהלה.

---

### ② גיוס לידים (בלי ועדת הקבלה)

**מה כבר מוכן:** טופס ציבורי (`/apply`) עם הגנת ספאם · יצירת ליד ידנית · תהליך "גיוס" עם
4 תת-שלבים ומשימות אוטומטיות · כרטיס ליד עם משפחה, קהילה, מסמכים ותקשורת · דוח גיוס ·
טופס גיוס הניתן להגדרה מה-UI.

**מה נשאר להשלים:** לוודא שהמיגרציה `20260724110000_recruitment_process_seed.sql` הורצה
ב-Supabase (בלעדיה כל ליד נוצר בלי תהליך).

**מה צריך לבדוק עם המשתמשים:** האם 4 השלבים תואמים את העבודה בפועל; האם המשימות
האוטומטיות מגיעות לאדם הנכון; האם הטופס הציבורי אוסף את מה שצריך.

**תלויות/חסמים:** חשבון עם תפקיד `recruiter` + הגדרת מחלקת "גיוס".

**מי יכול להתחיל ראשון:** **צוות הגיוס** — עצמאי לחלוטין, לא תלוי בשאר המערכת.

---

### ③ מודולי תפעול: אחזקה · מטבח · ביטחון (אירועים)

**מה כבר מוכן:** שלושה מודולים עצמאיים מלאים — קריאות שירות עם קטגוריה/דחיפות/שיוך/סטטוס;
תוכניות ארוחה ורישום תלמידות ופרופיל תזונתי; יומן אירועי ביטחון עם מעברי סטטוס. לכל אחד דוח.

**מה נשאר להשלים:** הזנת נתוני בסיס — בניינים וחדרים (לאחזקה) ותוכניות ארוחה (למטבח).

**מה צריך לבדוק עם המשתמשים:** האם רשימות הקטגוריות מתאימות; האם זרימת הסטטוסים
תואמת את העבודה.

**תלויות/חסמים:** אחזקה תלויה ב-`dorm_buildings`/`dorm_rooms` (או `location_text` חופשי).

**מי יכול להתחיל ראשון:** **אחראי אחזקה, אחראי מטבח, אחראי ביטחון** — כל אחד בנפרד, בו-זמנית.

---

### ④ מאגר אנשים + צוות (HR)

**מה כבר מוכן:** מאגר אנשים מרכזי · חיפוש · כרטיס אדם · **זיהוי כפילויות + מיזוג רשומות**
(ה-RPC הכי חזק במערכת) · קליטת עובד אטומית · משרות מרובות · מחלקות · סיום העסקה ·
**תצוגה מקדימה של scope** לפני מתן הרשאה.

**מה נשאר להשלים:** להחליט על **תיק העובד העשיר** — כרגע חוזה, שכר, השכלה ותעודות
נשמרים כ-JSON בשדה הערות ולא ניתנים לחיפוש, ו**קובץ החוזה לא נשמר בכלל** (רק שמו).
זו החלטה ארגונית לפני שמתחילים להזין נתוני אמת.

**מה צריך לבדוק עם המשתמשים:** האם עץ המחלקות משקף את המכון; האם רשימת התפקידים מלאה;
האם "תצוגה מקדימה של scope" מובנת למנהל שנותן הרשאה.

**תלויות/חסמים:** ⚠ **החלטה על תיק העובד** — כדאי לקבל אותה לפני הזנת עובדים.

**מי יכול להתחיל ראשון:** **מנהלת משאבי אנוש** + **מזכירת הנשיא**.

---

### ⑤ פנימייה (שיבוץ חדרים)

**מה כבר מוכן:** בניינים עם מגדר · חדרים עם קומה וקיבולת · שיבוץ תלמידה עם תאריכים ·
חישוב תפוסה מכוסה בטסטים · מניעת שיבוץ כפול · היסטוריית שיבוצים · דוח פנימייה ·
חיבור אוטומטי לאחזקה ולביטחון.

**מה נשאר להשלים:** אין ישות **"אמא בית"** — אי אפשר לומר "אמא בית X אחראית על בניין Y".
זו תוספת קטנה יחסית (טבלת קשר) אבל היא לא קיימת. כמו כן אין **מגורי אורחים**.

**מה צריך לבדוק עם המשתמשים:** האם רזולוציית "חדר" מספיקה או שצריך מיטות; האם נדרשות
בקשות החלפת חדר.

**תלויות/חסמים:** דורש שתלמידות כבר קיימות במערכת (כלומר: אחרי שתהליך הקבלה רץ, או
אחרי ייבוא CSV).

**מי יכול להתחיל ראשון:** **מנהלת הפנימייה** — אך רק אחרי שיש תלמידות במערכת.

---

### מסלול מומלץ (סדר)
```
שבוע 1:  ① משימות + יומן          →  כל הצוות המנהלי
שבוע 1:  ③ אחזקה + מטבח + ביטחון  →  אחראי התפעול (במקביל, עצמאי)
שבוע 2:  ④ אנשים + צוות           →  אחרי החלטה על תיק העובד
שבוע 2:  ② גיוס לידים             →  צוות הגיוס
שבוע 3+: ⑤ פנימייה                →  אחרי שיש תלמידות
```

---

## 25. שאלות לפגישה

### 25.1 שאלות טכניות (למתכנת)

1. **אילו מיגרציות הורצו בפועל ב-Supabase?**
   169 קבצי מיגרציה, מורצים ידנית. יש כלי (`node scripts/verify-migrations.mjs > verify.sql`)
   שמפיק שאילתת אימות. **יש להריץ אותו לפני כל דיון על מה "עובד".**

2. **טבלת `students` ה-legacy** — 5 מקומות עדיין קוראים ממנה, אף אחד לא כותב אליה:
   `study-groups` ×2, `staff/scope-preview` ×2, `lib/education/permissions.ts:500`.
   האם המונים האלה מציגים אפס בפרודקשן? האם למחוק את הקריאות?

3. **שני מנגנוני מסמכים במקביל** — `document_records` (המודול הרשמי) ו-`journey_documents`
   (בשימוש בכרטיס התלמידה). האם לאחד?

4. **`campus_admin`** — התפקיד מוזכר ב-`lib/auth/landing.ts` כ"אדמין רחב", אבל מיגרציה `002`
   מבצעת `TRUNCATE roles` ולא מזריעה אותו מחדש. האם הוא קיים בפועל?

5. **RPCים ב-PL/pgSQL ללא כיסוי בדיקות** — `complete_stage` (~300 שורות), `start_process`,
   `merge_persons`, `advance_academic_year`, `create_staff_member`, `transition_education_status`.
   הקוד עצמו מציין: "אי אפשר לבדוק SQL מקומית". **מה תוכנית האימות?**

6. **E2E לא רץ** — צריך רק להגדיר secret `STAGING_URL` (+ `STAGING_E2E_USER`/`PASS`) ב-GitHub.
   **האם להקים staging?** יש כבר `.env.staging.example` ו-`supabase/staging-bootstrap.sql`.

7. **Sentry** — הקוד מוכן ומחכה ל-DSN. 15 דקות עבודה. **מתי מפעילים?**

8. **`CRON_SECRET`** — אם לא מוגדר, ה-endpoints של ה-cron **פתוחים לכל העולם**. האם הוגדר?

9. **מסך למסלול הביקורת** — הנתונים נאספים ב-8 טבלאות אבל אין ממשק. מה העלות של מסך בסיסי?

10. **גיבויים** — `docs/ops/launch-readiness.md` דורש: (א) אישור שגיבוי יומי פעיל, (ב) **ביצוע
    שחזור-בדיקה אחד**. שניהם מסומנים כלא-בוצעו. **גיבוי שלא נבדק אינו גיבוי.**

---

### 25.2 שאלות מוצר ותהליכי עבודה

11. **חובות אקדמיים — הפער הגדול ביותר.**
    אין במערכת מושג של "השלמת קורס" או "חוב אקדמי". צריך להחליט:
    - מה מגדיר "השלימה קורס"? ציון סופי? נוכחות מינימלית? החלטת מרצה?
    - כשלא השלימה — מה קורה? חוב שנרשם? חזרה על הקורס? מבחן חוזר?
    - מי סוגר חוב, ומה נדרש כדי לסגור?
    - האם החוב חוסם משהו (מעבר שנה? קבלת תעודה?)

12. **תיק עובד** — כרגע חוזה, שכר, השכלה ותעודות נשמרים כטקסט JSON בשדה הערות,
    וקובץ החוזה **לא נשמר** (רק שמו). מה באמת צריך?
    קורות חיים · דיפלומות · מכתבי המלצה · חוזה חתום · תעודות הסמכה — כקבצים?

13. **מסמכים משרדיים/משותפים** — כרגע כל מסמך חייב להיות מקושר לתלמידה.
    האם צריך "ספריית מסמכים של מחלקה"? "מסמכים משותפים לכל הצוות"?

14. **סודיות ברמת ההערה** — כרגע הסודיות היא ברמת המודול, לא ברמת הרשומה.
    האם באמת נדרש "רק אני והמנהלת נראה את ההערה הזו"? אם כן — זה שינוי משמעותי
    (אבל יש תקדים מוצלח: `finance_access_grants`).

15. **אמהות בית / מחנכות** — אין ישות "מחנכת של תלמידה X" או "אמא בית של בניין Y".
    איך זה עובד בפועל במכון, ומה צריך שהמערכת תדע?

16. **מגורי אורחים** — לא קיים בכלל. האם נדרש?

17. **`contacts` נפרד מ-`persons`** — ספק שהוא גם תורם יופיע פעמיים.
    האם לאחד, או שההפרדה נכונה?

18. **תלמידה במסלולים מרובים** — התשתית תומכת (`journey_study_tracks` רבים-לרבים).
    האם זה קורה בפועל? כמה מסלולים בו-זמנית?

19. **פורטל התלמידה** — 8 פאנלים מוכנים. **מתי נותנים לתלמידות סיסמאות?**
    ומה בדיוק הן צריכות לראות (וממה להימנע)?

20. **התהליך הישן `acceptance`** — מועמדות שכבר בתוכו ממשיכות בוועדה המקבילית.
    האם יש כאלה בפועל? מתי מכבים אותו סופית?

---

### 25.3 החלטות שדורשות את הנהלת המכון

21. **מי אחראי הכספים?**
    ההרשאות `approve_discount` ו-`confirm_payment` **רשומות במערכת אך לא ניתנו לאף תפקיד** —
    המיגרציה מציינת במפורש שזו החלטת הבעלים (§6.2 פתוח).
    זרימת ההנחה של 90% **חסומה** עד שמחליטים. **החלטה חוסמת.**

22. **מודל הרשאות הכספים** — האם עובד רואה כספים של **כל** התלמידות, או רק של אלה
    שהוא מלווה? התשתית תומכת בשניהם (`finance_access_grants`). **צריך מדיניות.**

23. **גישה למידע רגיש** — מי מקבל `persons.view_sensitive` (דרכון, כתובת, תאריך לידה)?
    מי מקבל `view_sensitive_alerts`? כרגע `view_sensitive_alerts` **לא ניתנה לאף אחד**.

24. **מבנה רמות הקודש** — האפיון (`docs/specs/judaism-department-module.md`) קובע 6 רמות
    ו-8 קבוצות, אבל **מיפוי התלמידות הקיימות אליהן מסומן כ"פתוח"** וצפוי להיות ידני
    ע"י חנה אסתר בפתיחת הסמסטר הראשון. **מתי זה קורה?**

25. **סדר ההשקה** — לפי סעיף 24 יש 5 חלקים כמעט מוכנים. **מי מתחיל ראשון ומתי?**
    ההמלצה: משימות+יומן ותפעול (אחזקה/מטבח/ביטחון) — שניהם ללא תלויות.

26. **גיבויים ושחזור** — האם Supabase בתוכנית Pro (גיבוי יומי + PITR)?
    בתוכנית Free **אין גיבוי אוטומטי מנוהל**. **זו החלטה תקציבית שחוסמת השקה.**

27. **הדרכה ותיעוד למשתמש** — קיים `user-docs/he/` עם מדריכים ל-11 תפקידים.
    **מי מעביר הדרכה? האם המדריכים מעודכנים למצב הנוכחי?** (עודכנו לאחרונה ב-30 באוגוסט)

28. **מדיניות "מי משנה מה"** — מסלול הביקורת אוסף נתונים אך אין ממשק, ו**אין תיעוד צפייה בכלל**.
    האם המכון צריך לדעת מי **צפה** במידע רגיש (ולא רק מי שינה אותו)?

---

## נספח: מקורות עיקריים שעליהם מבוסס הדוח

| נושא | קבצים מרכזיים |
|---|---|
| מודל אנשים ומחזור חיים | `supabase/migrations/001_initial_schema.sql`, `20260512162314_education_journeys_part1_create.sql`, `20260705120100_transition_education_status_rpc.sql`, `20260901120000_merge_persons_rpc.sql` |
| הרשאות | `supabase/migrations/002_roles_and_privileges.sql`, `middleware.ts`, `lib/education/permissions.ts`, `lib/auth/module-privileges.ts`, `lib/permissions/scope.ts`, `lib/persons/redact.ts` |
| מנוע workflow | `20260529130000_recreate_workflow_engine.sql`, `20260703170000_admission_student_conversion.sql`, `20260813120000_acceptance_v2_sequential.sql`, `20260724110000_recruitment_process_seed.sql`, `lib/workflow/*` |
| לימודים | `20260511115733_create_education_tables.sql`, `20260715120000_studies_management_foundation.sql`, `20260720150000_unify_semester_class_group.sql`, `20260721120000_studies_drilldown.sql`, `20260903100200_journey_study_tracks_multi.sql`, `20260904120000_calendar_day_types.sql` |
| נוכחות וציונים | `20260705150000_lessons_attendance.sql`, `20260715140000_attendance_three_statuses.sql`, `20260705170000_grades.sql`, `20260818120000_absence_cases.sql` |
| כספים | `20260705190000_finance_billing.sql`, `20260719120000_finance_tuition.sql`, `20260719140000_staff_compensation.sql`, `20260903130000_tuition_settings_and_discounts.sql` |
| מודול יהדות | `docs/specs/judaism-department-module.md`, `20260903100000`–`20260904120000` |
| ביקורת ואבטחה | `20260702170000_audit_log.sql`, `20260703140000_audit_log_expand_privileges_staff_workflow.sql`, `lib/api/route-authorization.test.ts` |
| תיק תלמידה | `app/dashboard/education/leads/[id]/LeadViewClient.tsx`, `app/dashboard/education/students/[id]/page.tsx` |
| תפעול | `docs/ops/launch-readiness.md`, `vercel.json`, `.github/workflows/ci.yml` |
| תיעוד קיים (לא מעודכן ל-4.9.26) | `HANDOFF.md`, `docs/GAP_ANALYSIS.md` (16.7.26), `docs/CORE_ARCHITECTURE_v2.md`, `user-docs/he/` |

---

*הדוח נוצר ב-4 בספטמבר 2026 מסריקה בפועל של commit `9e9f61c`. לא בוצע שינוי קוד.*
