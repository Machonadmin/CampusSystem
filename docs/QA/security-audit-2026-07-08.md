# דו״ח ביקורת QA + אבטחה — CampusSystem

- **תאריך**: 2026-07-08
- **סוג**: ביקורת קוד קריאה-בלבד (read-only), אדוורסרית
- **היקף**: כל שכבת ה-API (`app/api/**`), `middleware.ts`, שכבת ההרשאות (`lib/**/permissions.ts`, `lib/permissions/scope.ts`, `lib/auth/*`), הלוח המאוחד (`app/api/calendar/**`, `lib/calendar/*`), ולוגיקת הכסף/התאריכים.
- **מודל אבטחה**: app-layer בלבד — RLS כבוי, השרת משתמש ב-service_role. כל כלל גישה חי בקוד ה-API.

> הערה: הביקורת עצמה הייתה קריאה-בלבד — לא בוצעו שינויי קוד, commit, push או פעולות כתיבה על מסד הנתונים. קובץ זה הוא מסמך סיכום בלבד.

---

## טבלת ממצאים מקוצרת

| # | חומרה | סטטוס | ממצא | מיקום עיקרי |
|---|-------|-------|------|-------------|
| 1 | Critical | חשד | סוד JWT עם ברירת מחדל קשיחה → זיוף superadmin | `lib/auth/config.ts:2` |
| 2 | High | מאושר | endpoints login-only שמדליפים PII | `app/api/staff/route.ts:15`, `app/api/persons/route.ts:9`, `app/api/education/class-groups/[id]/enrollments/route.ts:21` |
| 3 | High | מאושר | עקיפת scope כאשר `department_id=null` → כתיבה/מחיקה חוצת-מחלקות | `lib/permissions/scope.ts:60`, `lib/auth/module-privileges.ts:68` |
| 4 | Medium | מאושר | דרכון/כתובת נחשפים לבעל `persons.view` בכל scope | `app/api/persons/[id]/route.ts` |
| 5 | Medium | מאושר | scope ('own'/'department') מתעלמים בכל המודולים (fail-open) | `lib/*/permissions.ts` |
| 6 | Medium | מאושר | יתרת ledger כספי ללא עימוד → יתרה שגויה | `app/api/finance/journeys/[id]/ledger/route.ts:44` |
| 7 | Medium | מאושר | ספירות אגרגציה בחינוך ללא עימוד → נוכחות/ציונים שגויים | `app/api/education/class-groups/[id]/lessons/route.ts:49` ועוד |
| 8 | Low | מאושר | פערי שער במידלוור (staff / quality-control) | `middleware.ts:9` |
| 9 | Low | מאושר | הזרקת watchers למשימה ע״י צופה | `app/api/tasks/[id]/watchers/route.ts:61` |
| 10 | Low | מאושר | רשימות ללא עימוד (tasks, dormitory assignments) | `app/api/tasks/route.ts:35` |
| 11 | Low–Med | מאושר | אי-סימטריה בהרשאות כתיבת מסמכים (create מול manage) | `app/api/documents/person/[personId]/route.ts:44` |
| 12 | Low | חשד | TOCTOU באישור תשלום | `app/api/finance/payments/[id]/approve/route.ts:35` |
| 13 | Low | מאושר | רשומות קהילה ניתנות לעריכה ע״י כל מחובר | `app/api/education/communities/[id]/route.ts:52` |
| 14 | Low | מאושר | ראוט login רושם מידע רגיש ל-console | `app/api/auth/login/route.ts:21` |

---

## 🔴 Critical

### 1. סוד ה-JWT עם ברירת מחדל קשיחה בקוד → זיוף superadmin והשתלטות מלאה
- **חומרה**: Critical — **חשד** (תלוי-סביבה; לא אומתו משתני-הסביבה של הפרודקשן).
- **מיקום**: `lib/auth/config.ts:2`
  ```ts
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!',
  ```
- **תיאור**: אם `JWT_SECRET` אינו מוגדר, כל הטוקנים נחתמים ומאומתים במפתח HS256 גלוי הידוע מהקוד. `docs/onboarding.md:34` מזהיר במפורש שהדיפולט לא בטוח.
- **תרחיש ניצול**: תוקף חותם קוקי `campus_session` עם `{ person_id: <כל ערך>, roles: ["superadmin"] }` במפתח הידוע → `superadmin` עוקף כל בדיקה במערכת. השתלטות מלאה.
- **תיקון מוצע**: להסיר את ה-fallback ולזרוק שגיאה בעליית האפליקציה אם `process.env.JWT_SECRET` חסר או קצר מ-32 תווים (fail-fast). `.env.example`/`.env.staging.example` מגדירים את המשתנה, אך אין fail-closed בקוד.

---

## 🟠 High

### 2. נקודות-קצה שמדליפות PII וזמינות לכל משתמש מחובר (ללא בדיקת הרשאה)
- **חומרה**: High — **מאושר**.
- **תיאור**: מספר endpoints מבצעים רק בדיקת "מחובר" (`getSession`/`guard`/`requireAuth`) בלי בדיקת פריווילגיית מודול. אפילו סטודנט חסר-הרשאות מקבל מידע רגיש:
  - `app/api/staff/route.ts:15-17` — `GET` קורא רק ל-`guard()` ומחזיר את כל מדריך הצוות: `full_name, email, phone, department, position, hire_date, employment_type`. (השווה `POST`/`DELETE` הדורשים `persons.create/delete`, ו-`/api/persons/staff` הדורש `persons.view`).
  - `app/api/persons/route.ts:9-11` — `GET` login-only מחזיר `full_name/email/phone` של כל אדם.
  - `app/api/education/class-groups/[id]/enrollments/route.ts:21` — `GET` login-only, מחזיר רשימת סטודנטים כולל **email** (שורה 37).
  - `app/api/education/class-groups/[id]/route.ts` (GET), `app/api/education/students/[id]/enrollments/route.ts` — רשימות/שיוכים ללא בדיקת פריווילגיה.
- **תרחיש ניצול**: משתמש עם session כלשהו פונה ל-`GET /api/staff` / `GET /api/persons?search=` / `GET /api/education/class-groups/<id>/enrollments` וקוצר אימיילים, טלפונים ורשימות תלמידים חוצות-מחלקה.
- **תיקון מוצע**: לעטוף כל אחד ב-`requirePersonsPrivilege('view')` / `requireEducationPrivilege('view_students', <target>)` כמו ה-endpoints המקבילים. לכל הפחות להסיר `email` מ-`enrollments`.

### 3. עקיפת scope כאשר department_id הוא NULL → כתיבה/מחיקה חוצת-מחלקות של leads ו-journeys
- **חומרה**: High — **מאושר**.
- **מיקום (שורש)**: `lib/permissions/scope.ts:59-62` (וזהה ב-`lib/auth/module-privileges.ts:67-73`)
  ```ts
  if (scope === 'department') {
    if (!target?.department_id) return true   // אין מחלקת-יעד ⇒ גישה מאושרת!
    return ctx.departmentIds.includes(target.department_id)
  }
  ```
- **תיאור**: עבור `scope='department'`, כשמחלקת-היעד `null` — הבדיקה עוברת ללא תנאי. `education_journeys.primary_department_id`/`desired_department_id` הם nullable, ו-leads רבים חסרי מחלקה. הראוטים מזינים `... ?? undefined`:
  - `app/api/education/leads/[id]/route.ts:32-34` (DELETE), `:113-115` (PATCH) — `manage_leads`.
  - `app/api/education/journeys/[id]/route.ts:156-158` (PATCH), `:258-260` (DELETE), `:84` (GET).
  - `app/api/education/journeys/[id]/transition/route.ts:64-66` (שינוי סטטוס).
- **תרחיש ניצול**: משתמש עם `manage_leads` ב-`scope='department'` יכול לערוך/למחוק כל lead שמחלקתו `null` — למעשה כל הפניות הלא-משויכות.
- **תיקון מוצע**: בענף ה-`department`, כשמחלקת-היעד `null` עבור journeys/leads — להחזיר `false` (או לדרוש `scope='all'`). fix כירורגי: לדחות null-dept בארבעת הראוטים במקום לשנות את `scope.ts` גלובלית.

---

## 🟡 Medium

### 4. מספר דרכון וכתובת נחשפים לכל בעל persons.view עם scope='department'/'all'
- **חומרה**: Medium — **מאושר**.
- **מיקום**: `app/api/persons/[id]/route.ts` (מחזיר `passport_number, address, nationality, marital_status, birth_date`) + שורש ב-`lib/auth/module-privileges.ts:68`.
- **תיאור**: `persons/[id]` מוגן רק ב-`requirePrivilege('persons','view')` ואינו מעביר target. משתמש `scope='department'` מקבל `true` וקורא דרכון/כתובת של כל אדם ע״י מעבר על UUID-ים. אין בדיקת שייכות פר-רשומה ואין רדקציה ברמת-שדה.
- **תיקון מוצע**: לאכוף scope פר-רשומה, או להפריד שדות PII רגישים מאחורי פריווילגיה נפרדת (`persons.view_sensitive`).

### 5. scope ('own'/'department') מתעלמים בשקט בכל המודולים → כשל-פתוח
- **חומרה**: Medium — **מאושר** (מתועד כ-MVP מכוון).
- **מיקום**: `lib/{doctor,psychologist,finance,sponsors,alumni,dormitory,food,security,maintenance,documents,contacts,reports}/permissions.ts` — `has*Privilege` מחזירה `!!access.privileges[priv]` ומתעלמת מ-`scope`. `get*PrivilegeScope` לא נקראות מאף ראוט.
- **תיאור**: אם אדמין יעניק תפקיד עם `scope='own'/'department'`, הקוד מתייחס אליו כ-`'all'` — התפקיד יכול לקרוא/לערוך/למחוק כל רשומה במודול (כולל נתונים רפואיים/פסיכולוגיים).
- **תיקון מוצע**: להסיר את בורר ה-scope מה-UI למודולים אלו, או ש-`require*Privilege` ייכשל-סגור כשה-scope אינו `'all'`, עד להטמעת scoping אמיתי.

### 6. יתרת ה-ledger הכספי מחושבת מ-select ללא עימוד → יתרה שגויה
- **חומרה**: Medium — **מאושר**.
- **מיקום**: `app/api/finance/journeys/[id]/ledger/route.ts:44-58` (סכימה ב-`:67`).
- **תיאור**: החיובים והתשלומים נקראים ללא `.range()`. לסטודנט עם >~1000 שורות PostgREST חותך בשקט ו-`balance` שגוי. `app/api/finance/students/route.ts` (רשימה) כבר תוקן לעמוד — כך ששני ה-endpoints יכולים לחלוק על יתרת אותו סטודנט.
- **תיקון מוצע**: לעמד את שני ה-selects בלולאה ואז להעביר מערכים מלאים ל-`computeLedgerTotals`.

### 7. ספירות אגרגציה בחינוך ללא עימוד → אחוזי נוכחות/ממוצעי ציונים שגויים
- **חומרה**: Medium — **מאושר**.
- **מיקום**: `app/api/education/class-groups/[id]/lessons/route.ts:49-56` (`marked_count`), `.../assessments/route.ts:49-56` (`graded_count`), `app/api/education/journeys/[id]/report/route.ts:133-137`, `:166-171`.
- **תיאור**: קריאות `.select(...).in(...)` הסופרות שורות-ילד ב-JS ללא `.range()`. קבוצה עם >1000 שורות תיחתך — נוכחות/ציונים מדווחים בחסר.
- **תיקון מוצע**: `{ count: 'exact', head: true }` פר-הורה (כמו `class-groups/[id]/route.ts:209`, `assessments/[id]/route.ts:95`), או לעמד את שאילתת-הילד.

---

## 🟢 Low

### 8. פערי שער במידלוור (staff / quality-control)
- **מיקום**: `middleware.ts:9-13` (`PROTECTED_MODULES` חסר `staff`, `quality_control`), `:64-75`. הנתיב `/dashboard/quality-control` (מקף) לא ישווה ל-`quality_control` (קו-תחתון).
- **תיאור**: עמודי `/dashboard/staff` ו-`/dashboard/quality-control` נגישים לכל מחובר. בשילוב עם ממצא 2 — וקטור ההגעה בפועל.
- **תיקון**: להוסיף `staff` ל-`PROTECTED_MODULES` וליישר שם-נתיב מול קוד-מודול. התיקון העיקרי הוא באכיפת ה-API.

### 9. הזרקת watchers למשימה ע״י כל צופה
- **מיקום**: `app/api/tasks/[id]/watchers/route.ts:61-106`.
- **תיאור**: `POST` דורש רק `canView`; `person_ids` מוכנסים ללא ולידציה → צופה מרחיב מי רואה את המשימה.
- **תיקון**: להגביל ל-`canEdit`, או לאמת שהמבצע יוצר/assignee.

### 10. רשימות ללא עימוד (tasks, dormitory assignments)
- **מיקום**: `app/api/tasks/route.ts:35-84`; `app/api/dormitory/rooms/[id]/assignments/route.ts:44-54`.
- **תיאור**: `.select('*')` ללא `.range()` — חיתוך שקט מעל ~1000 שורות (שלמות-נתונים).
- **תיקון**: לעמד כמו שאר הראוטים.

### 11. אי-סימטריה בהרשאות כתיבת מסמכים (create מול manage)
- **מיקום**: `app/api/documents/person/[personId]/route.ts:44` (`documents.create`) מול `app/api/documents/journeys/[id]/route.ts:65` ו-`documents/[id]` (`documents.manage`).
- **תיאור**: `documents:create` מוענק רחב; בעל `create` ללא `manage` יכול לקבוע `status='verified'` ל-`person_documents` של כל אדם (רושם `verified_by=self`).
- **תיקון**: לאחד את מודל ההרשאה לכתיבת מסמכים.

### 12. TOCTOU באישור תשלום
- **חומרה**: Low — **חשד** (קונקורנטיות).
- **מיקום**: `app/api/finance/payments/[id]/approve/route.ts:35-51`.
- **תיאור**: בדיקת `status!=='pending'` ואז `UPDATE .eq('id')` בלי תנאי `status='pending'`. approve מול cancel מקבילים → תשלום מבוטל מוחיה ל-`approved`.
- **תיקון**: כתיבה מותנית `.eq('id',id).eq('status','pending')`, 0 שורות → 409. אותו דפוס ב-`PATCH payments/[id]`, `PATCH charges/[id]`.

### 13. רשומות קהילה ניתנות לעריכה/מחיקה ע״י כל מחובר
- **מיקום**: `app/api/education/communities/[id]/route.ts:52-102` (PATCH), `:110-142` (DELETE) — רק `requireAuth()`.
- **תיקון**: לדרוש פריווילגיית `manage_*`.

### 14. ראוט login רושם מידע רגיש ל-console
- **מיקום**: `app/api/auth/login/route.ts:21,46,64,97` — לוג אימייל, תקינות-סיסמה (boolean), תפקידים.
- **תיקון**: להסיר/למתן בפרודקשן.

---

## מה נבדק ולא נמצאה בעיה

- **הלוח המאוחד (Calendar) — נקי** (`app/api/calendar/**`, `lib/calendar/*`):
  - `appointments/[id]` PATCH/DELETE מגודרים ל-`provider_id = session.person_id` — משתתף צופה אך לא משנה. GET עושה dedup נכון (provider wins).
  - `overlap.ts` — בודק רק `scheduled` של המשתמש; גבולות חצי-פתוחים; נבדק שוב ב-PATCH; אין עקיפה דרך timezone/גבול.
  - `/lessons`, `/schedule`, `/tasks`, `/blocks`, `/birthday` — self-scoped, מעומדים, `.in()` מוגן מפני מערך ריק (`resolveMyClassGroupIds`).
  - `expandScheduleSlots` — מיפוי ISO ליום-שבוע נכון, טווח כולל, בטוח-DST; ההרחבה קליינט-סייד וחסומה לחודש/שבוע.
  - `birthdayInstances` — 29 בפברואר ו-null תקינים; טוגל תאריכים עבריים SSR-safe ופרזנטציוני בלבד.
- **money.ts — נקי.** סכימה באגורות שלמות; אין סכימת float של כסף.
- **מכונות-מצב security/maintenance — נקי.** `canTransition` (409), `resolved_at` תקין.
- **`.catch()`/`.finally()` על Supabase builder — לא נמצא.** ה-hits הם על `res.json()`/`request.json()` או `.then()` (מותר).
- **i18n parity — עובר.** `ru/he/en` = 1932 מפתחות זהים; הטסט ירוק.
- **change-password — נקי.** מאמת סיסמה נוכחית, מוגבל ל-session.
- **Cookie flags — תקין.** `httpOnly`, `sameSite='lax'`, `secure` בפרודקשן; JWT 7d מאומת.
- **doctor/psychologist — נקי** מלבד ממצא 5 (scope).
- **`.in([])` ריק — לא נמצא לא-מוגן.**
- **אמון בקלט לקוח** — אף ראוט לא סומך על `person_id`/`role` מהגוף; תמיד מה-session.

---

## סדר עדיפויות לתיקון
1. **fail-closed על `JWT_SECRET`** (ממצא 1).
2. **הוספת `requirePrivilege` ל-endpoints login-only** שמדליפים PII (ממצא 2).
3. **סגירת עקיפת null-department** עבור leads/journeys (ממצא 3).
4. ממצאי ה-scope (4, 5) וה-truncation (6, 7).
5. שאר ממצאי ה-Low.
