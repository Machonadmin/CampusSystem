# Studies management (נושא הלימודים) — plan & progress

Durable record of the studies-management build for מכון חמש, agreed with the
product owner. Use this to continue even after chat context is lost.

STATUS 2026-07-15: **Management/staff hierarchy (§2) — BUILD COMPLETE** (owner
confirmed "done"). What remains for §2 is data entry (assign real people to
roles) + one optional future item: ראש-חול auto-assign across all chol units.
Now working through the **studies/academic hierarchy (§1)**: study_tracks
completed (school/college/university/touro + emuna-inactive) via migration
20260715220000; dual placement, per-journey track (journey_study_tracks +
StudyTrackPanel), the freely-nested structure editor (#66), and a track-
assignment worklist (#68, `/dashboard/education/track-assignment`) that surfaces
approved students with no chol track for inline assignment (operationalises
"track decided at אישור לימודים" without touching the acceptance engine).
Track now also chosen AT approval (#69): the acceptance-overview admit modal
(final_approval → admitted/admitted_conditional) shows a chol-track picker; on
complete, the server persists it to journey_study_tracks (best-effort, deploy-
safe). Optional ("assign later" falls back to the #68 worklist).
Structure editor is now full-featured: create/rename/delete, **tier labels**
(#70, `departments.structure_tier`, mig 20260715240000), **manual ordering**
(#71, up/down via `departments.sort_order`), **move teaching groups between
nodes** (#72, `class_groups.department_id`), and **shows each node's head**
(#76, `departments.head_person_id`). Reports show each student's **track** (#73).
Self-review fixed two latent bugs: unit-report 500 from ordering
class_enrollments by a nonexistent `id` (#74), and gradebook grade pagination
ordered by a non-unique column (#75). i18n parity verified (2820 keys × 3).

ONLY remaining §1 item, still BLOCKED on owner input: **entry groups +
durations** (after ט' / above י"א; 2/3/4 yrs). Needs the owner's field model —
which fields matter (entry year? current level? expected end/bagrut date?).
Do NOT build until the owner specifies. Also still open: the מכללה vs קולג'
naming decision (do not rename without an explicit answer).

## 1. Studies hierarchy (the domain)

Every student is in TWO parallel domains, split by time of day:

- **🌅 קודש (Judaism)** — morning, ~2 lessons, ALL students. ONE manager
  (אחראי לימודי קודש) over everyone.
- **☀️ חול (secular)** — afternoon, by track. Managed per-track (see §2).

**A student's track is decided at "אישור לימודים" (studies approval), from the
moment she enters.** The two managers place her independently: the kodesh
manager places her morning group, the chol/track manager her afternoon group.
Grouping can be split by level, but ALWAYS within the same track (a בית-ספר girl
never sits with a university girl, morning or afternoon).

### Secular track tree
- **Entry group A — after grade 9 (young, enters grade י'):**
  - 🏫 **בית ספר (school)** — 2 years = grades י'+י"א → bagrut. May then leave, or
    continue to university (~4 more yrs → up to 6 total in the institution).
  - 🎓 **קולג' (college)** — 4 years (young): prep/bagrut-completion, then practical.
- **Entry group B — above grade 11 (arrives with bagrut):**
  - 🎓 **קולג'** — 3 years → college education.
  - 🏛️ **אוניברסיטה (university):** university-only, OR **university + טורו** (extra
    parallel hours → master's, Russia + USA). Some choose no-Touro (less load).
- **📘 טורו** — a fully separate track (its own manager).
- **🕎 אמונה (Emuna)** — full-day-Judaism program, currently INACTIVE (skip).

Open items: exact kodesh internal order (רמה/שיעור/כיתה) — TBD when we get there.
"מקצוע/התמחות" existing entities — leave for now.

## 2. Staff / management hierarchy

- 👑 **מנהל כללי** (superadmin)
  - 📣 **גיוס** (recruitment — already existed)
  - 🌅 **קודש** — אחראי לימודי קודש (one, over all)
  - ☀️ **ראש חול** (one for now, may change) over the per-track chol managers:
    - 🏫 תיכון → סגנית מנהלת התיכון
    - 🎓 קולג' → אחראי לימודי מקצוע
    - 🏛️ אוניברסיטה → אחראי אקדמיה
    - 📘 טורו → מנהל הטורו
    - 🕎 אמונה → מנהלת אמונה (inactive)
- Every manager has his own **מזכירות (secretaries)** + **מורים (teachers)**.
- All chol track-managers are the SAME permission level (each over his track).

### Capabilities (agreed)
- **Manager (studies_manager):** VIEWS all students; MANAGES only his unit
  (placement, class groups, schedule, teachers, grades, attendance override).
  Adds secretaries + teachers (create-new or assign-existing). Sets each
  secretary's permissions (per-person toggles). End-to-end control of his unit;
  all reports/statistics.
- **Secretary:** permissions set per-person by her manager (toggle set). Base:
  view her unit's students.
- **Teacher:** one domain (maybe several later — pick domain when assigning a
  lesson). Home screen = his schedule ("my lessons today"). Marks attendance.
  Writes permanent per-lesson notes (visible to everyone above). Writes a
  student evaluation ONLY when his manager opens that option.
- **Grades:** MANAGER only for now; a manager may later grant grade-entry to a
  secretary or teacher per-person (via person_privileges).

### Attendance model (agreed)
- 3 statuses only: **נוכחת (present)=0 · מאחרת (late)=0.5 · חסרת (absent)=1**.
- Teacher edits only **during the lesson + 30 min**; after → only his manager.
  Manager may grant a specific teacher extra time (fixed = lesson_id NULL, or
  one-time = a specific lesson_id) in `teacher_attendance_grants`.
- Attendance % = (marked − (absent + 0.5·late)) / marked.
- Attendance UI must be excellent/clear/prominent/fast (owner emphasized).

## 3. Technical model / decisions

- **Study unit = a `department`.** Managers/secretaries/teachers get
  `staff_positions` in the unit; manager = `is_head`. Department scoping
  (`getUserDepartmentIds` + `grantsAccess`) confines management to the unit;
  `view_students=all` lets managers see everyone.
- **Per-person permissions = `person_privileges`** (module='education'), wired in
  `lib/education/permissions.ts` via `applyPersonGrants` (scope.ts):
  is_granted=false = deny (overrides role), is_granted=true = grant at
  ≥ department scope. This powers secretary toggles + delegated grading + the
  (future) evaluation gate.
- **ראש חול (umbrella):** model as a studies_manager with is_head positions in
  all chol units (not yet automated — set up manually / future).
- Attendance edit window: timezone-correct via `lib/education/attendance-window.ts`
  (Asia/Jerusalem, Intl, DST-safe). Managers bypass (manage_students on target).
- `excused` attendance rows migrate → `present` (confirm with owner if wrong).

## 4. Build status (all merged to main)

- #49 keystone — activate `person_privileges` (applyPersonGrants + wiring, tests).
- #50 Phase 0+1 — roles `studies_manager`/`studies_secretary`, study units as
  departments (migration 20260715120000), revoke teacher.set_grades; unit-access
  helper; `/api/education/units*`; `/dashboard/education/units` team panel.
- #51 Phase 2 — dual placement: `/api/education/journeys/[id]/placements` +
  `PlacementsPanel` on the student card.
- #52 Phase 3a — 3-status attendance + weights (migration 20260715140000);
  metrics.ts weights; report/StudentReportTab/AttendancePanel updated.
- #53 Phase 3b — attendance edit window enforcement (+ grants lookup).
- #54 Phase 4a — teacher "my day": `/api/education/my-lessons` +
  `/dashboard/education/my-day` + home widget.
- #55 — my-lessons deploy-safe (select '*').
- #57 Phase 4b — permanent lesson notes (migration 20260715160000; lesson_notes
  API + LessonNotes in AttendancePanel).
- #58 Phase 4c — student evaluations, manager-gated via write_evaluation
  person_privilege (migration 20260715180000; evaluations API + EvaluationsPanel).
- #59 Phase 3c — manager grants a teacher extra attendance minutes
  (attendance-grant API + control in the unit team panel).
- (Earlier this session: UI redesign to the "console" token system with
  light/dark + per-user toggle; a full security audit + fixes.)

## 5. Migrations

- **RUN:** notifications, calendar_events, study_tracks, departments,
  20260715120000 (studies_management_foundation — roles/units).
- **RUN (owner confirmed):** 20260715140000 (attendance 3-status + weight +
  lessons.scheduled_end_time + teacher_attendance_grants), 20260715160000
  (lesson_notes), 20260715180000 (student_evaluations), 20260715200000
  (lesson_roster_overrides — one-time lesson guests). All confirmed RUN by
  owner 2026-07-15.
- **RUN (owner confirmed 2026-07-15):** 20260715220000 (study_tracks_complete —
  added אוניברסיטה + אמונה[inactive], reordered to hierarchy).
- OPEN QUESTION for owner (still unanswered): existing 'college' is named
  'מכללה' but owner says 'קולג'' — rename TBD. Do NOT rename without an explicit
  answer.
- Migrations are hand-written and run MANUALLY by the owner in Supabase (provide
  SQL inline; if asked about RLS → "Run without RLS").

## 6. Remaining roadmap (in order)

DONE: 4b lesson notes (#57), 4c evaluations (#58), 3c grant UI (#59),
campus timetable + conflict detection (#61), aggregate unit reports (#62),
gradebook matrix + CSV export (#63).

Reports foundation done: unit dashboard (per-group + per-student attendance% /
grade-avg / totals) at `/dashboard/education/reports`
(`GET /api/education/units/[unitId]/report`, canManageUnit-gated, paged+chunked);
gradebook matrix per group (`GET /api/education/class-groups/[id]/gradebook`) +
CSV export everywhere (`lib/csv.ts`).

Current order (owner-approved 2026-07-15 — did 3 then 1, DEFER 2 until spec):
1. ✅ DONE (#65) **One-time per-lesson roster override**: a girl attends a
   single lesson outside her group. Table `lesson_roster_overrides`
   (migration 20260715200000 — PENDING owner run in Supabase; code is
   deploy-safe via `(sb as any)` + 42P01 catch). Roster GET unions guests
   (is_guest flag), attendance POST allows guests, `POST/DELETE
   /api/education/lessons/[lessonId]/roster` add/remove (mark_attendance-gated),
   AttendancePanel has guest badge + search-add + remove.
2. **Kodesh internal structure — GENERIC approach (owner 2026-07-15: "אין לי
   עדיין... יש דרך להתקדם ובהמשך להגדיר תפקידים?").** Owner does NOT have the
   fixed רמה/שיעור/כיתה taxonomy yet and wants to build the tree now, assign
   roles later. KEY REALISATION: `departments` is already self-referential
   (`parent_id` + `head_person_id`) and study units ARE departments — so the
   kodesh internal tree = **nested sub-units (sub-departments)** the owner names
   freely (רמה/שיעור/כיתה or anything), with `class_groups` (lessons/attendance/
   grades) attached to leaves. NO new table, NO migration. "Define roles later"
   = assign a head/secretary to any sub-unit via the EXISTING units team panel
   (person_privileges / staff_positions is_head).
   BUILD: a study-unit-scoped Structure editor in the education module
   (`/dashboard/education/structure`, API `/api/education/units/[unitId]/
   structure*`, canManageUnit-gated, subtree-membership-checked). Manager builds
   /renames/reorders/removes sub-units and sees teaching groups under each node.
   (Superadmin can already do generic nesting in Settings → Departments.)
3. ✅ DONE (#64) **Reports period filter:** date-range (from/to) on the reports
   dashboard + gradebook, filtering lessons/assessments to a semester/exam
   period. (Per-assessment drill-down already covered by the gradebook matrix.)

Later (unordered): exceptions (חריגים — girls only in one domain); weighted
grades + assessment types; ראש-חול auto-assign across all chol units.

## 7. Build discipline (every increment)
Branch `claude/product-improvements-zq6cq4` → commit → rebase onto origin/main →
force-with-lease push → PR → squash-merge → resync. Keep `npx tsc --noEmit`
clean, `npm test` green, `npm run build` succeeding, and he/en/ru i18n parity.
Console design tokens (var(--surface)/--text/--accent…), RTL logical props.
Don't put the model id in commits/PRs.
