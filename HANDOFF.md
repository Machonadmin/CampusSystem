# CampusSystem — מסמך העברה (Handoff) לצ'אט חדש

> מסמך זה נוצר כדי לעבור לצ'אט חדש בלי לאבּד הקשר. הוא מכיל: (1) כל מה
> שהוגדר בהתחלה, (2) סיכום מה שכבר עשינו, (3) תוכנית עבודה מפורטת להמשך,
> (4) כל מה שהצ'אט החדש צריך לדעת כדי להמשיך בלי שאלות.
>
> **הצ'אט החדש קורא את הקובץ הזה ראשון.**

---

## 0. עובדות תפעוליות קריטיות (לקרוא ראשון)

- **מי כותב את הקוד:** ה־assistant (אני) כותב את הקוד בעצמו בסביבה שלו.
  (בעבר עבדנו עם ה־agent ב־VS Code, אבל הוא קרס שוב ושוב — Windows
  `0xC0000409 STATUS_STACK_BUFFER_OVERRUN` — אז עברנו למצב שבו אני כותב.)
- **מי המשתמש:** בעל המוצר דובר עברית, **לא מתכנת**. הוא מסתמך על הדוחות שלי
  כמקור אמת. לכן: לעולם לא לשקר על סטטוס; כל סטייה מהמפרט מדווחת בראש הדוח.
  (ראה `CLAUDE.md` בשורש הריפו — חוקי העבודה.)
- **סגנון עבודה מועדף:** צעד־צעד, אחד־אחד. לא לערבב שאלות עם פרומפטים. לא לרוץ
  מהר מדי.
- **ענף פיתוח (branch):** `claude/product-improvements-zq6cq4`. דוחפים לשם.
  ה־PRים ממוזגים ואז מתחילים מחדש מ־main (force-with-lease מותר כשהענף מכיל
  רק היסטוריה שכבר מוזגה).
- **ריפו של הפרודקשן:** `Machonadmin/CampusSystem`, ענף `main`. **Vercel
  מפרסם מ־main של הריפו הזה.** (היה באג בעבר: ה־agent דחף בטעות לפורק אישי
  `Hel0585957700/CampusSystem` — לכן האתר לא השתנה. עכשיו תמיד Machonadmin.)
- **מיגרציות ב־DB:** נכתבות ידנית ב־`supabase/migrations/`, וה**משתמש מריץ
  אותן ידנית ב־Supabase SQL Editor**. אף פעם לא אוטומטי. "Success. No rows
  returned" זו הצלחה תקינה. אם Supabase שואל על RLS → הבחירה הנכונה היא
  **"Run without RLS"** (הפרויקט מכבה RLS, service key עוקף).
- **לפני כל מיזוג:** אם הקוד קורא עמודות/טבלאות חדשות — המיגרציה חייבת לרוץ
  ב־Supabase **לפני** המיזוג, אחרת הפרודקשן ייפול.
- **בכל צעד לבדוק:** `npx tsc --noEmit` + `npm test` (מעל 430 טסטים) +
  `npm run build` חייבים לעבור. לשמור זהות מפתחות i18n בין he/en/ru.
- **אסור לגעת ב־RPC `complete_stage`** (~300 שורות PL/pgSQL, מיגרציה
  `20260703170000`). אי אפשר לבדוק SQL מקומית — לכן חתימות נרשמות בקוד ה־route.
- **Supabase JS:** אין `.catch()` / `.finally()` על ה־builder. להשתמש ב־
  `const { error: _e } = await sb...` או `try/catch`. (Vercel build מחמיר.)
- **לעבוד רק על** `machonadmin/campussystem`.

---

## 1. מה המשתמש ביקש בהתחלה (החזון המלא)

**הפרויקט:** CampusSystem — מערכת ניהול למכון חינוכי לבנות ("מכון חמש").

הבקשות המקוריות, כולן:

1. **קטגוריות (סיידבּר):** לחלק ולשנות שמות לכל הקטגוריות בעברית ברורה יותר,
   עם קיבוץ הגיוני.
2. **שני סוגי נרשמים:** תלמידה מול איש/אשת צוות. הוספת צוות צריכה להיות ברורה
   (מאיפה/למה); רישום צוות שונה מרישום תלמידה; **ברירת מחדל למטבע בתשלום צריכה
   להיות רוּבֹּל, לא שקל.**
3. **תמיכה מלאה ב־3 שפות (he/en/ru):** כל מחרוזת — טפסים, הודעות שגיאה, שגיאות
   גישה מהשרת, שירות כללי — מתורגמת (לפחות גם לאנגלית).
4. **להסביר את כניסת הצוות:** למה בחרנו סיסמה+אימייל; יש דרך טובה יותר (זרימת
   הזמנה/invite)?
5. **קטגוריית "בקרת איכות":** מה זה, לשנות לשם ברור, מה היא עושה, למה מקושרת.
6. **זרימת החינוך/קבלה (הליבה):**
   - עמוד נחיתה ציבורי למתעניינים (תלמידה/הורה/נציג) → לכידת ליד.
   - רשימת גיוס/טרום־גיוס שהצוות מטפל בה (מתקשרים ללידים).
   - ואז **ועדת קבלה** רב־שלבית עם שלבים מקבילים/עצמאיים, כל שלב עם **חתימה
     דיגיטלית**:
     - (א) אחראי לימודים (אישור/דחייה/הפניה לרופא),
     - (ב) מנהלת פנימייה (אישור פנימייה/הערות/הפניה),
     - (ג) רופא/פסיכולוג (רק אם הופנתה),
     - (ד) בירור יהדות (חותם על סמך מסמכים שהועלו).
   - שלב הרופא **תלוי בהפניה**; השאר מקבילים/בכל סדר.
   - **הערות פרטיות לכל שלב** (נראות רק לחותם + מנהלים).
   - מסמכים מועלים.
   - **אישור מנהלת סופי + חתימה → הופכת לתלמידה.**
7. **מסלולי לימוד:** חצי יום ראשון יהדות לכולן; חצי שני מסלולים (אוניברסיטת
   טורו, בית ספר, מכללה) + חריגים.
8. לשתף רעיונות, לתת יתרונות/חסרונות, **לשאול הרבה שאלות**, לרצות שלמות.
9. דגש על **יופי של ה־UI** (דרך צ'אט Claude Design נפרד).

---

## 2. סטאק טכני

- **Frontend/Backend:** Next.js 14 App Router, TypeScript 5.6, React 18,
  Tailwind CSS 4.
- **DB:** Supabase (PostgreSQL). **RLS מכובה בכל הפרויקט** (service key).
- **Auth:** JWT מותאם אישית (`jose` HS256, cookie `campus_session` httpOnly,
  `bcryptjs`). **לא** Supabase Auth.
- **מודל הרשאות:** `persons` (רכזת; `full_name` עמודה מחושבת מ־first/last/
  middle) → `person_accounts` (login_email + password_hash) → `person_roles`
  → `roles` → `role_privileges` (module, privilege_code, scope: all/
  department/own) → קטלוג `module_privileges`.
- **i18n מותאם:** `messages/{he,en,ru}.json`, `useTranslations('namespace')`
  → `t('key', fallback)`. טסט זהות מפתחות `lib/i18n/messages-parity.test.ts`.
  שגיאות שרת: `apiError(code,status)` / `serverT(code)` קוראים namespace
  `errors` + cookie `campus_locale`.
- **מנוע Workflow (גנרי):** `process_templates` → `stage_templates` →
  `stage_finals`/`stage_transitions`/`stage_task_templates`; ריצה:
  `process_instances` → `stage_instances`. RPC `complete_stage` מטפל בסגירת
  שלב + מעברים (סמנטיקת join `after_one`/`after_all`) + המרת סטטוס journey.
  יש גם `close_process_early`. **לא לגעת ב־RPCים האלה.**
- **Deploy:** Vercel מ־`Machonadmin/CampusSystem` main.

---

## 3. מה כבר עשינו (PRs #3–#12)

**מוזגו:**
- מטבע ברירת מחדל רוּבֹּל.
- שינוי שמות + קיבוץ הסיידבּר.
- i18n לטופס הרישום.
- i18n מלא שרת + UI (315 מפתחות שגיאה).
- מודול "יהדות" + תפקידים `head_of_studies`, `jewishness_officer`.
- העלאת קבצים אמיתית (Supabase Storage, בקט פרטי `documents`).
- **חתימות דיגיטליות** (backend + UI, מוקלד + מצויר, מוגן IDOR, מוגבל לפי
  תפקיד).
- **תהליך קבלה רב־שלבי** (`acceptance`): שלבים `academic`(head_of_studies),
  `dormitory`(dorm_director), `jewishness`(jewishness_officer),
  `medical`(doctor,psychologist — מותנה בהפניה `refer_to_doctor`),
  `final_approval`(school_director). 3 מקבילים חובה + רפואי מותנה + סופי דרך
  `after_all`. finals: approved/rejected/refer_to_doctor/admitted/
  admitted_conditional.
- תפקיד `recruiter` + מודל הרשאות מלא + גישת persons.
- תרגום שם התהליך ("גיוס" במקום "Набор").
- תיקוני validation (community country/city אופציונליים), כוכבית טלפון.

**PR #12 (אבטחה — צריך למזג, בלי מיגרציה):**
- `stageSignerAuthority`: שלב עם תפקיד נחתם **רק** ע"י בעל התפקיד; override רק
  ל־`superadmin` (היה באג: `manage_leads` — לכן גיוס נגע בקבלה, ומנהלת פנימייה
  חתמה על יהדות).
- Sidebar: `canAccess` מסתיר מודולים בזמן טעינה (היה באג: אחרי refresh נראה
  כאילו לכל אחד גישה לכל המודולים).

---

## 4. הבאגים שדווחו לאחרונה (5) — סטטוס

1. **גיוס עדיין נוגע בקבלה אחרי המסירה** → תוקן ב־PR #12.
2. **מנהלת פנימייה יכלה לחתום על יהדות** → תוקן ב־PR #12.
3. **שלבים צריכים ליצור משימות עם תזכורות/יומן** → **טרם נבנה.**
4. **הרופא לא רואה הפניה, אין לו גישה, רוצים מאגר "מטופלות"** → **טרם נבנה.**
5. **פלאש מודולים ב־refresh** → תוקן ב־PR #12.

---

## 5. תוכנית עבודה מפורטת להמשך

### צעד מיידי
מזג את **PR #12** (תיקוני 1, 2, 5 — קוד בלבד, בלי מיגרציה).

### הפאזה הגדולה: תיבות־עבודה + משימות + מחלקות (באגים 3+4)

**A. מאגר הרופא ("מטופלות" / הפניות רפואיות) — הכי דחוף, הכי בּוֹדֵד**
- עמוד ייעודי **בתוך המודול של הרופא/פסיכולוג** (בלי לתת גישה לחינוך).
- מציג כל מועמדת שהשלב הרפואי שלה `active` (כלומר הופנתה).
- **המשתמש אישר: הרופא רואה הכל** — פרטים אישיים, מי הפנה ולמה + ההערה,
  המסמכים שהועלו, רשומות רפואיות קודמות.
- הרופא חותם ישירות משם (dispositions: כשירה/לא כשירה → finals של השלב הרפואי).
- מוגבל ע"י תפקיד `doctor`/`psychologist` (ה־workflow API כבר מוגבל תפקיד,
  לא מודול חינוך — לכן אפשר בלי גישת חינוך).

**B. משימות + תזכורות + סנכרון יומן**
- כל שלב קבלה יוצר **משימה** לאדם/תפקיד הנכון → מופיעה ברשימת המשימות + ביומן,
  עם תזכורת למחר.
- הערה על המנוע: יצירת משימה תומכת ב־assignee מסוג creator/department/position
  (**לא תפקיד ישירות**) — לכן זה קשור למחלקות אמיתיות (סעיף D).

**C. תיבות־עבודה אישיות**
- "ממתינות לחתימתי" לכל חותם קבלה.
- "הלידים שלי" + בריכה משותפת לגייסים (המשתמש בחר **גם וגם**: תיבה אישית + ראייה
  של הכל).

**D. מחלקות אמיתיות "גיוס" ו"קבלה"**
- ליצור במבנה הארגוני, לשייך חשבונות, להגביל הרשאות לפי מחלקה.

**E. כפתור "העבר לוועדת קבלה"**
- מסירה מפורשת, **חסום עד שכל השדות הנדרשים מלאים** — מחליף את שלב הגיוס הקבור
  (`decision → convert_to_applicant`).

**F. התראות** לאנשי הקבלה כשמועמדת נכנסת.

**G. תרגום הרוסית שנותרה** (מאוחסן ב־DB — לתרגם בזמן תצוגה או ב־re-seed):
- `process_events.content` (למשל «Процесс "Набор" запущен», «Подэтап
  завершён: <code>»).
- כותרות משימות מ־`stage_task_templates.title` (למשל «Собрать документы»).

**H. ארוך טווח (מהחזון המקורי, לא התחלנו):**
- מסך מאוחד צוות+גישה עם סיסמה אוטומטית (בקשה מקורית #2).
- מסלולי לימוד (חצי יום יהדות + טורו/בי"ס/מכללה + חריגים).
- עמוד נחיתה ציבורי + טופס ליד מורחב (תלמידה/הורה/נציג + בורר תחומי עניין).
- שפת עיצוב UI (דרך Claude Design).
- הערות פרטיות לכל שלב עם בקרת נראות.

---

## 6. קבצים מרכזיים (נוצרו/שונו)

- `lib/workflow/stage-access.ts` — `loadStageContext` + `stageSignerAuthority`
  (override רק superadmin לשלבים תפקידיים; manage_leads לשלבי גיוס).
- `lib/workflow/signature.ts` (+`.test.ts`) — `validateSignature` (typed/
  drawn/both; typed חייב להתאים ל־full_name של החותם).
- `lib/workflow/signature-storage.ts` — העלאה/בדיקה של תמונת חתימה (נתיב
  מוגן IDOR).
- `lib/settings/app-settings.ts` — `getSignatureMethod`/`setAppSetting`
  (טבלת `app_settings`).
- `app/api/workflow/stages/[stageInstanceId]/complete/route.ts` — ולידציית
  חתימה לפני RPC, קורא `complete_stage`, ואז INSERT ל־`stage_signatures`.
  אוטו־סטארט `acceptance` כש־`finish_reason==='converted'`.
- `app/api/workflow/stages/[stageInstanceId]/route.ts` — מחזיר
  `signature_method` + `can_manage`.
- `app/api/workflow/stages/[stageInstanceId]/signature/{upload,}/route.ts`.
- `app/api/settings/signature/route.ts` — GET/PUT (PUT superadmin בלבד).
- `components/workflow/SignatureCapture.tsx` — קלט מוקלד + `<canvas>` מצויר.
- `components/workflow/ProcessInfoBlock.tsx` — פאנל התהליך; פותח מודל חתימה,
  מעלה PNG ואז משלים שלב.
- `lib/documents/storage.ts` — `uploadDocument`/`getSignedUrl`
  (`DOCUMENTS_BUCKET='documents'`).
- `app/dashboard/documents/[id]/DocumentsStudentClient.tsx` — UI העלאה אמיתית.
- `components/education/EducationJourneyForm.tsx` — יצירת ליד/מועמדת/תלמידה.
- `app/api/applications/route.ts` — יצירת ליד + אוטו־סטארט "גיוס".
- `components/dashboard/Sidebar.tsx` — `canAccess` מסתיר מודולים בטעינה.
- `types/database.ts` — טיפוסים חדשים (StageSignature, AppSetting,
  StageTemplate += required_role_code/requires_signature, DocumentRecord +=
  storage_path וכו').

**מיגרציות (כולן הורצו ידנית ב־Supabase):**
- `20260713120000_jewishness_module_and_roles.sql`
- `20260713140000_document_storage.sql`
- `20260713150000_stage_signatures.sql`
- `20260713170000_acceptance_process.sql`
- `20260713180000_acceptance_signers_education_access.sql`
- `20260713190000_recruitment_acceptance_permissions.sql`
- `20260713200000_recruiter_persons_access.sql`

---

## 7. חשבונות בדיקה (ב־Supabase, סיסמה `Test1234!`)

- `giyus@test.machon` — recruiter (גיוס)
- `limudim@test.machon` — head_of_studies (אחראי לימודים)
- `pnimia@test.machon` — dorm_director (מנהלת פנימייה)
- `yahadut@test.machon` — jewishness_officer (אחראי יהדות)

**זרימת בדיקה:** להיכנס כ־recruiter → ליצור ליד → לקדם תהליך גיוס ל־"decision"
→ "convert to applicant" → תהליך הקבלה מתחיל אוטומטית → כל חותם חותם על השלב שלו
→ school_director/superadmin אישור סופי → הופכת לתלמידה.

*(חסר עדיין: חשבון רופא/פסיכולוג + המסך שדרכו הוא חותם — זה הצעד הבא.)*

---

## 8. הצעד הבא המדויק לצ'אט החדש

1. לוודא ש־PR #12 מוזג.
2. **לבנות את מאגר הרופא (סעיף 5.A):** עמוד במודול הרופא/פסיכולוג שמציג מועמדות
   שהופנו (השלב הרפואי `active`), עם **כל המידע** עליהן, + חתימה משם. זו הדרך
   שבה הרופא יראה ויחתום — כרגע אין לו כזו.
3. אחריו: תיבות־עבודה לשאר החותמים + משימות/תזכורות/יומן (סעיפים 5.B/5.C).

**לפני שמתחילים לבנות — לאשר עם המשתמש** (הוא ביקש לעבוד צעד־צעד).
