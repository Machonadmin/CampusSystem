# Continuity notes — Machon Chamesh (מכון חמש)

Durable state so any new session can continue seamlessly. Owner is a
non-programmer (Hebrew); staff are Russian-speakers (RU is the default UI
language). Talk to the owner in Hebrew.

## Working setup
- Dev branch: `claude/product-improvements-zq6cq4`.
- Flow per change: commit → PR (mcp github) → squash-merge → resync
  (`git fetch origin main -q && git checkout -B claude/product-improvements-zq6cq4 origin/main -q && git config user.email noreply@anthropic.com && git config user.name Claude && git push -u origin … --force-with-lease`).
  Branch-only commits are LOST on resync — always merge to main to persist.
- **No DB access in the agent env** — verify via code, not a live run. Owner runs
  migrations manually in Supabase SQL Editor (expects "Success. No rows returned").
- Ship gate: `npx tsc --noEmit` clean · `npm run build` compiles · `npm test` = 499
  passing · i18n parity ru/he/en (flatten keys → identical sets).
- Deploy: Vercel from `main` (campus-system-chi.vercel.app). Migrations are manual.

## Test accounts (pw: Test1234!) — each is now head of its own unit
- giyus@test.machon (recruiter → גיוס) · limudim@test.machon (head_of_studies → לימודים)
- pnimia@test.machon (dorm_director → פנימייה) · yahadut@test.machon (jewishness_officer → יהדות)

## Key IDs
- Kodesh department (לимודи קодеш / Кафедра иудаики): `9a3d7b3f-3f65-4653-a111-4d5296404a27`
- System actor (public form): `ffffffff-0000-4000-8000-000000000001`

## Shipped this session — product improvements (PRs #114–#120, all merged)
- **Kodesh exceptions enforced** (#114/#115): shared `lib/education/kodesh-exceptions.ts`
  (`loadKodeshGroupIds`, `loadKodeshExemptions`, pure `dateInAnyRange`, unit-tested).
  On an exempt date a kodesh lesson drops the student from journal roster + attendance
  WRITE, calendar, per-student report denom+tally, unit report, at-risk, teacher X-of-Y.
- **Portal isolation hardened** (#116): `getUserAccess` (lib/education/permissions.ts) and
  `canManageUnit` return ZERO for `principal==='student'` (bypassing the person_id cache),
  so a dual-role person's portal token can't read staff data. Tests in
  `lib/education/portal-isolation.test.ts`. Middleware guards only PAGES, not `/api/*`.
- **Reminder cron** (#118): `GET /api/cron/reminders` + `vercel.json` daily 06:00 UTC +
  account-wide `materializeAll*` in `lib/notifications/reminders.ts`. Owner: set `CRON_SECRET`
  in Vercel; needs a plan with Cron. Before this, reminders only materialized on bell-poll.
- **CSV export** (#118 batch): persons, sponsors, contacts, documents, maintenance, security,
  doctor, psychologist lists (reuses `common.export_csv`, exports visible rows). Canonical
  helper is `lib/csv.ts` `downloadCsv(name, [headerRow, ...rows])` (retired `lib/export/csv.ts`).
- **Reports drill-down** (#118): each summary card links to its module.
- **Communities management** (#118): `/dashboard/education/communities` (⚙ menu) — CRUD over
  the previously UI-less `/api/education/communities`; GET now returns `can_manage`.
- **Workflow template editor** (#119): superadmin-only `/dashboard/settings/workflows` — full
  CRUD of process templates: processes, stages (incl. WHO SIGNS `required_role_code` +
  `requires_signature`), finals (incl. `closes_process`+reason), task templates, transitions
  (after_one/after_all). Extended stage-templates & stage-finals POST/PATCH to accept those
  signer/closing fields (were SQL-only). Superadmin-gated in UI and server.
- **Bulk actions** (#120): tasks (mark done / assign), students (assign to class/track/kodesh),
  finance (bulk charge). All loop existing per-item endpoints (permissions preserved);
  finance list GET now returns `can_charge`.

## Shipped this session — round 2 (PRs #119–#123, merged)
- **Workflow template editor** (#119), **bulk actions** (#120), **kodesh generate-all** (#121)
  — see round-1 list note; all merged.
- **Reports period filter** (#122): `/dashboard/reports` period selector (all/month/year/custom).
  Finance & sponsors report endpoints accept `?from&to` (finance: charge created_at +
  payment paid_at; sponsors: donation_date); those two cards refetch + show a "for period"
  badge. Other cards stay current snapshots (point-in-time by nature).
- **Full jewishness module** (#123): persisted `education_journeys.jewishness_status`
  (pending/verified/rejected/needs_review) + `jewishness_status_history`, migration
  `20260717120000_jewishness_verification.sql` (owner must run). Two-way sync via shared
  `lib/jewishness/status.ts`: completing the acceptance `jewishness` stage writes the status
  (reverse), and the module sets it directly (forward) — both write the same field. Module UI
  = full list + status filter/search + detail (set status, docs, history, signed acceptance
  decision). `StageContext.stageCode` added. Deploy-safe (pre-migration everything reads pending).

## Open items needing the owner
- Reminder cron: confirm Vercel plan supports Cron + set `CRON_SECRET` (from round 1).
- Report period-awareness for non-money cards (maintenance/security/clinic/counseling "in window",
  new leads by open date) — offered; needs a decision on what "in period" means per metric.
- Optional: jewishness status **badge on the student/lead card** (module + sync shipped; badge
  on the education student card not yet added).
- Any migrations from these sessions not yet run make those features silently empty (deploy-safe).

## Shipped earlier (merged to main; PRs #94–#112)
Studies workspace + header declutter (3 daily links + ⚙ management, underline tabs);
role-scoped tabs (each sees only theirs); admission+committee merged into one קבלה
tab; doctor/psychologist referral split; final-approval gate (blocked until a
referred doctor/psych signs) + full signatures review; track pick already at the
academic stage; attendance present/late/absent breakdown (journal/my-day/reports);
recruitment categories (interested/in_process); public leads auto-start recruitment;
··· row-menu fixed (position:fixed); recruiter journey-scoped document upload;
student portal (email+password login via `student_credentials`, own dashboard/
calendar/grades/attendance/messages); staff→student messages (`student_messages`);
attention layer (at-risk absences via `/api/education/at-risk`, stalled applicants);
mobile grid collapse (`.resp-grid-2/3`); unit-head data for test accounts.

**KODESH** (religious studies, reuses class_groups model): 6 groups (כיתה י, כיתה
י"א, כיתה 1..4) under the kodesh dept, subject "קודש", fixed slots 09:15–10:30 &
11:00–12:10 on Mon–Thu (ISO day_of_week 1–4). Migration
`20260716240000_kodesh_groups_seed.sql`. Assignment screen `/dashboard/education/kodesh`
(`/api/education/kodesh/assignment` GET/PUT, gated `canManageUnit(kodesh dept)` =
kodesh head/superadmin, NOT the general manager). Owner runs the migration, then
assigns students, then generates lessons per group (class-group → Schedule tab →
"generate"); then kodesh flows into each student's unified calendar + attendance.

## Security — portal isolation (audited + hardened, PR #116)
Students log in via `student_credentials` → token `principal:'student'`, `roles:[]`,
`student_journey_id`. **Middleware confines students to `/portal` PAGES only — it does
NOT guard `/api/*`**; all API isolation is per-route. Portal own-data routes
(`journeys/[id]/{calendar,grades,report,messages,meetings}`) self-gate:
`if principal==='student' { if student_journey_id!==params.id → 403 } else {staff priv}`.
Staff-only routes deny students via privilege failure. **Fixed dual-role gap:** the
education permission engine keyed staff privileges off `person_id`, so a person who is
BOTH student+staff could pass staff checks via the portal token. Now `getUserAccess`
(lib/education/permissions.ts) returns zero privileges for `principal==='student'`
(bypassing the person_id cache), and `canManageUnit` returns false for students — every
staff education route denies a student deterministically. Tests:
`lib/education/portal-isolation.test.ts`. When adding a NEW staff route, rely on
`requireEducationPrivilege`/`canManageUnit` (both now student-safe); for a NEW
student-facing route, add the explicit self-gate above.

## Gap-analysis polish (PR #117)
System-wide gap audit → shipped the safe finishing wins: report cards now drill
down to their module (ReportsClient "Open module →"); CSV export added to persons/
sponsors/contacts/documents/maintenance/security/doctor/psychologist (reuses
`common.export_csv` + each module's column labels; helper `lib/csv.ts` — retired the
duplicate `lib/export/csv.ts`); **communities** management screen at
`/dashboard/education/communities` (CRUD over the previously UI-less
`/api/education/communities`; GET returns `can_manage`; under the education ⚙ menu);
sponsor email validation. Full audit report (with [NEEDS-OWNER] items) delivered to
owner — see below.

## Open [NEEDS-OWNER] items (from the gap audit, awaiting owner input)
- **Workflow/process template designer**: recruitment+acceptance flows are
  API-configurable but have NO editing UI (only SQL/seed). Building a visual editor
  needs scoping (relabel-only vs full add/remove stages).
- **Reminder scheduler**: task-deadline/follow-up reminders only materialize when
  someone opens the app (lazy inside GET /api/notifications). No Vercel Cron. Needs
  owner's Vercel-plan confirmation to wire a cron → materialize functions.
- **Report period filters**: reports are all-time; adding date-range needs a period
  decision + backend params on ~11 endpoints.
- **Bulk actions**: no multi-select anywhere; which bulk ops + which lists.
- **jewishness module**: currently only a signing queue, not a per-student
  verification record.

## Domain facts
- Kodesh is universal — every student is in exactly one kodesh group. The KODESH HEAD
  assigns (head of the kodesh dept), not the general director.
- Lessons = dated instances generated from `class_schedule_slots` (recurring weekly
  template, ISO day_of_week 1=Mon..7=Sun). Student calendar aggregates
  class_enrollments → class_groups → lessons → attendance. Late = 0.5 weight.
- Parent access: explicitly NOT wanted by the owner.

## Pending / next
- Optional: a "generate all kodesh lessons" convenience; per-slot teacher.

## Done — KODESH exceptions (PRs #114 + #115, merged)
Manager approves exempting a specific student from mandatory kodesh ("always kodesh
unless special approval"). Migration `20260716260000_kodesh_exceptions.sql` (table
`kodesh_exceptions`, journey_id CASCADE, approved_by, reason, effective_from/to).
API `/api/education/journeys/[id]/kodesh-exceptions` GET/POST/DELETE, all gated
`canManageUnit(kodesh dept)`. Panel `KodeshExceptionsPanel` in the student view.
Owner must RUN the migration in Supabase SQL Editor.

**Enforcement (#115):** the exemption now auto-flows everywhere via shared helper
`lib/education/kodesh-exceptions.ts` (`loadKodeshGroupIds`, `loadKodeshExemptions`,
pure `dateInAnyRange`; deploy-safe to 42P01, unit-tested). On an exempt date a
kodesh-dept lesson drops the student from: the journal roster + the attendance
WRITE path (attendance route), her calendar (journeys/[id]/calendar), the
per-student report denominator+tally, the unit report, at-risk counts, and the
teacher "X of Y" (my-lessons). Only kodesh-department lessons are touched; the
staff calendar `/api/calendar/lessons` is intentionally untouched (staff have no
journeys).
