# Core plan vs. built — gap analysis (2026-07-16)

Canonical spec: **`docs/CORE_ARCHITECTURE_v2.md`** (+ `CORE_HIERARCHY.mermaid`) —
owner's "מכון חמש architecture v2". Languages: **Russian (primary) + EN + HE**.
Director/superadmin = Rabbi Avraham. Everything beyond the 7 core sections = bonus.

## Verdict
We built strong **manager/admin scaffolding** but under-built the **student core**
(the plan is student-centric — §5–6 are its heart). Not wrong-direction drift;
we built the 2nd floor before the 1st.

## Aligned with core ✅
- Attendance rules: 3 statuses, late = half absence, feeds % (§6).
- Units + roles (after 2026-07-15 cleanup): kodesh/school/college/university/touro/
  emuna; rector/dean/school_director/vice_director/head_of_studies/teacher/student;
  deputy (approach B). Permissions by role + person_privileges (§1, §4 partial).
- Tracks + dual placement (study system + kodesh morning) (§3 — placement exists).
- Acceptance committee → student + track chosen at admission (§5 entry).
- Secretary is capable of the "operational engine" powers via toggles (§2).

## Bonus (beyond the 7 core sections) 🎁
- Campus timetable + conflict detection.
- Aggregate manager reports + gradebook + CSV + period filter (admin-side; the
  core asks only for a per-STUDENT dashboard).
- **Structure editor with arbitrary nesting + tiers + ordering + move-groups —
  OVER-ENGINEERED vs the flat core model (unit → class → level).**
- One-time guest attendance; track-assignment worklist; study-plan panel.
- Dark mode; student CSV importer; teacher attendance extra-minutes.
(Several are genuinely useful; keep as admin aids, but they are not the core.)

## Missing from core ⚠️ (this is where we strayed)
- 🗓️ **Student merged calendar** (study + kodesh in ONE calendar, day colored by
  attendance, click a day → per-lesson detail: present/late/absent, teacher,
  lesson content) — §5–6. THE HEART. Not built.
- 📊 **Student dashboard** (# lessons since year start, attendance %, grade avg) —
  §5. We built manager reports instead of the student-facing dashboard.
- 🤝 **Meetings** (teacher schedules a meeting with a student after a lesson →
  shows in her calendar → mark "done") — §5. Not built.
- 🔑 **Delegation of permission-GRANTING** (manager can give an employee the
  ability to approve permissions for their subordinate) — §4. Only partial
  (person_privileges grants exist; no "right to grant" meta-permission).
- 📚 **Level system** (Class belongs to a unit and has a Level) — §7. CORRECTION
  (2026-07-16): a Level entity ALREADY EXISTS — `reference_levels` (id,
  direction_id, name_ru, sort_order, is_active) + `reference_directions` +
  `/api/education/levels?direction_id=`. The real gap is only that
  `class_groups.level` is a TEXT field, not an FK to `reference_levels`. So this
  is a LINKING refactor (needs owner decision on migrating existing text levels),
  NOT a new entity — do NOT duplicate reference_levels.
- 🔐 Student login/password — explicitly "next phase" in the plan (ok to defer).
- 👭 Communities view — "aspiration/future" (ok to defer).

## What to change & how
1. Adopt CORE_ARCHITECTURE_v2 as the canonical spec (done — saved to repo).
2. Keep the aligned core.
3. **Refocus on the student experience** in order: merged calendar → student
   dashboard → meetings.
4. Right-size over-engineering: the structure editor stays as a tool, but the
   OFFICIAL model is flat (unit → class → level) — don't build further on deep
   nesting.
5. Build permission delegation (the §4 "right to grant").
6. Everything RU-default + HE + EN in full (i18n parity maintained: 2894 keys × 3;
   Hebrew-only data fixed 2026-07-15).

## Proposed order
- Phase 1 (the heart): student merged calendar + day-detail view + student dashboard. ✅ DONE (#89).
- Phase 2: meetings (teacher↔student, mark done). ✅ DONE (#90).
- Phase 3 (both need an owner decision, so paused):
  - Delegation (§4 "right to grant"): confirm the model — an employee gains the
    ability to toggle person_privileges for their subordinates, capped to what
    the granter holds?
  - Levels: link `class_groups` to the EXISTING `reference_levels` (don't create
    a new table); decide how to migrate existing text `class_groups.level` values.
Bonuses remain as admin aids; no further investment until the core student
experience exists.
