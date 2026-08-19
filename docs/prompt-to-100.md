# Prompt — Drive CampusSystem to 100% (Launch-Ready)

> Copy the block below and give it to Claude Code as the first message of a
> fresh session. It is self-contained: a cold agent can follow it without
> prior context.

---

```
You are working on CampusSystem — a production CRM for a Torah-educational
campus (leads → applicants → students → alumni, plus staff, finance, dormitory,
study management, a generic workflow engine, and a student portal). The system
is ~97% functionally complete: 20 modules live, 568 passing unit tests, clean
`tsc`, full 3-language i18n (he/ru/en), CI, and staging. Stack: Next.js 14
(App Router) + TypeScript + Supabase (Postgres, service-role, RLS off) +
Vercel. Migrations live in `supabase/migrations/` and are applied manually via
the Supabase Dashboard.

READ FIRST, before writing any code:
- /CLAUDE.md — the project rules. They OVERRIDE your defaults. In particular:
  (1) Do NOT deviate from a given spec without asking first; if you see a better
      way, STOP, describe the discrepancy, and ask for approval before changing.
  (2) Report honestly. If a migration failed, tests didn't pass, or you skipped
      something — say so explicitly, at the TOP of your report, before "done".
  (3) The Supabase JS client returns a PostgrestBuilder, NOT a Promise — never
      use `.catch()`/`.finally()` on it (breaks the Vercel build).
- docs/README.md, docs/architecture.md, docs/permissions.md — the map.
- The latest docs/status-review-*.md — current state and open items.

The owner is not a professional programmer and relies on your reports as the
source of truth. Accuracy matters more than speed.

GOAL: take the system from ~97% to genuinely launch-ready (100%). "Launch-ready"
is defined by the exit criteria at the bottom — not by "it compiles".

Work through these workstreams IN ORDER. After each, run `npm test` and
`npx tsc --noEmit`, and commit with a clear message. Do each on the designated
dev branch; do not push to main/production without explicit approval.

── WORKSTREAM 1 — Operational readiness (HIGHEST PRIORITY, do first) ──
This has been deferred for days and is the real blocker to launch.
1a. Verify EVERY migration in supabase/migrations/ has actually been applied to
    the live DB. Do NOT assume — check. Write a short SQL/script that lists the
    tables/columns each migration should create and reports any that are missing
    on the live schema. Report the result explicitly (all applied / list gaps).
    If gaps exist, tell me which migration and stop for approval before running.
1b. Error monitoring: integrate Sentry (or equivalent) for server + client, so
    a user-facing crash is visible without waiting for a complaint. Keep secrets
    in env vars only.
1c. Backups: confirm Supabase daily backups are on, and document a tested
    restore procedure against the staging DB (actually perform one restore).
1d. A pre-launch env checklist: JWT_SECRET strength, all required env vars set,
    the private `documents` Storage bucket exists.

── WORKSTREAM 2 — Security & permissions verification ──
2a. End-to-end permission test: create one account per major role (secretary,
    teacher, unit manager, finance, superadmin) and verify each sees exactly
    what it should — and CANNOT reach what it shouldn't (expect 403). Automate
    the core cases as tests: "no privilege → 403" for a sample of endpoints.
2b. Student-portal isolation: prove student A cannot see student B's data and a
    student principal gets ZERO staff privileges. Add a regression test.
2c. OPEN ARCHITECTURAL DECISION — do not implement without asking: department
    scope is currently FLAT, not hierarchical. `grantsAccess()` in
    lib/permissions/scope.ts checks direct membership (`departmentIds.includes`)
    and does NOT walk the `departments.parent_id` tree. So a top manager does
    not automatically see sub-units beneath them. Present the trade-off (keep
    explicit assignment vs. implement tree inheritance, ~2-3 days) and ask the
    owner to decide.

── WORKSTREAM 3 — Finish the UI-efficiency plan (sprints 1, 4, 5) ──
Sprints 0, 2, 3 are largely done (design tokens, lean tables ≤5 cols,
typography, page-header consistency). Remaining, per docs/status-review-2026-07-20:
3a. Navigation & wayfinding: consistent breadcrumbs on every screen; role-based
    smart landing (each role lands on its relevant screen); make global search
    prominent (Ctrl/Cmd-K from anywhere).
3b. Heavy screens, one by one: split the largest pages (e.g.
    app/dashboard/education/page.tsx, ~747 lines) into per-tab sub-pages;
    student card → a default "Overview" tab showing the 80% that matters.
3c. Measurement: with 3 real users (secretary, teacher, manager), run one common
    task each, count clicks/time, and ask "where did you feel lost?". Fix what
    surfaces. Guiding principle throughout: "one screen = one goal."

── WORKSTREAM 4 — Launch preparation ──
4a. User guides in user-docs/ for the new modules, in Hebrew, per role.
4b. Real-data import: validate the student CSV importer end-to-end on staging
    with a realistic file; document the import procedure.
4c. Final polish pass: empty/loading/error states everywhere, and a sweep of any
    remaining hardcoded strings (CI already enforces i18n parity).

RULES OF ENGAGEMENT:
- Verify by running the app / tests, not by assuming. Independent verification
  over trust.
- Keep every commit green (tests + tsc). i18n parity must hold (CI enforces it).
- For anything irreversible or production-facing (running a migration on the
  live DB, pushing to main), confirm with me first.
- Report deviations and failures at the TOP of your summary, before "done".

EXIT CRITERIA (this is what "100% / launch-ready" means):
[ ] Every migration verified applied to the live DB (or gaps reported).
[ ] Error monitoring live; daily backups confirmed + one restore tested.
[ ] Each major role verified end-to-end; "no-privilege → 403" covered by tests.
[ ] Student-portal isolation proven and regression-tested.
[ ] The flat-vs-tree scope decision made (by the owner) and, if chosen,
    implemented.
[ ] UI: breadcrumbs + role landing + prominent search shipped; the top heavy
    screens split; a real-user pass done and its findings addressed.
[ ] Hebrew user guides for all modules; real-data import validated on staging.
[ ] Full suite green, tsc clean, i18n parity holds.

Start with Workstream 1a (verify migrations) and report what you find before
moving on.
```

---

## איך להשתמש בזה

1. פתח סשן חדש של Claude Code על הפרויקט.
2. הדבק את כל הבלוק שבתוך המסגרת למעלה כהודעה הראשונה.
3. הסוכן יתחיל מווידוא המיגרציות (workstream 1a) וידווח לפני שימשיך —
   כך תדע בוודאות אם באמת הכל רץ (אמרת "נראה לי שהרצתי הכל" — הצעד הזה
   מוודא את זה במקום להניח).

**הערה:** הפרומפט בנוי כך שהסוכן **עוצר לאישור** לפני כל דבר בלתי-הפיך
(הרצת מיגרציה על המסד החי, דחיפה לפרודקשן) ולפני ההחלטה האדריכלית על
ההיררכיה — כדי שאתה תישאר בשליטה.
