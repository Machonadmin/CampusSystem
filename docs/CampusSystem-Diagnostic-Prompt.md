# CampusSystem — Documentation-vs-Code Diagnostic Brief

> **How to use this file:** Paste this whole document as your first message in Claude Code, alongside the project's documentation files (`architecture.md`, `permissions.md`, `workflow-engine.md`, `recruitment-template.md`, `education-module.md`, `db-schema.md`, `conventions.md`, `onboarding.md`, `README.md`). Then let Claude Code read the actual source and verify each point.

---

## Context

I'm working on **CampusSystem** — a CRM for an educational campus (leads → applicants → students → alumni, plus staff, a generic business-process engine, and a task system).

**Stack:**
- Next.js 14 (App Router) + TypeScript 5.6
- React 18 + Tailwind CSS 4
- Supabase / PostgreSQL (`@supabase/supabase-js`), accessed server-side with a **service-role key that bypasses RLS**
- Auth: JWT in an httpOnly cookie (`jose`, HS256)
- Hosting + auto-deploy: Vercel

**Deploy reality (be careful):** development happens on a single branch (`claude/bold-brown-TXaZl`) and **every push auto-deploys straight to production**. There is no staging environment and no PR review gate. Migrations live in `supabase/migrations/` but are **applied manually** via the Supabase Dashboard. **Do not push, do not run migrations, do not modify code in this session — diagnosis only.**

I'm attaching the project documentation. Read it first: it describes the *intended* state and the project conventions.

---

## Your task

**Do not trust the documentation as ground truth.** The docs describe intent; the code is reality. Your job is to **verify the gap between the two** and map out **where we actually stand vs. where we're aiming**.

You have access to the real source code. For every verification point below, tell me: **EXISTS / MISSING / PARTIAL**, with a **file + line reference** and a one-line explanation. Where the code contradicts the docs, say so explicitly and quote the relevant line.

Diagnose only — **do not fix or change anything yet.**

---

## Verification points (known suspects from the docs)

1. **Duplicated `education_status`.**
   It appears on both `persons` (docs call it a "duplicate marker") and `education_journeys`. Find who actually **writes** and **reads** each one, whether they stay in sync, and which is the real source of truth in practice. Flag every place that could desync.

2. **Enum mismatch on journey status.**
   The `JourneyStatus` type in `types/database.ts` includes values (`graduated`, `expelled`, `lost`, `on_leave`) that — per the docs — do **not** exist in the DB enum `person_education_status` (which only has `lead | applicant | student | alumni`). Find any code path that tries to **write** a value not present in the DB enum; that write will fail at runtime.

3. **In-memory permissions cache on serverless.**
   `lib/education/permissions.ts` caches privileges/departments in memory for ~30 seconds (`clearPermissionsCache`). Show me how it's implemented and assess whether it's actually broken on Vercel serverless, where separate invocations may run on separate instances (cache inconsistent or simply never hit).

4. **Hand-maintained DB types.**
   Determine whether `types/database.ts` is **hand-written** or generated via `supabase gen types`. If hand-written, look for **drift** against the actual migrations (columns/enums/tables that exist in one but not the other).

5. **No transactions in the workflow engine.**
   The docs state the `lib/workflow/` helpers (`startProcess`, `completeStage`, `closeProcessEarly`, `handleTaskCompletion`, `reactivateStage`) run **without transactions** and only log warnings on failure. Map out exactly where a mid-operation failure leaves a **partial state** (half-closed process, orphaned tasks, stage instances stuck in a non-terminal status). Rank the riskiest spots.

6. **Per-endpoint authorization.**
   Convention says **every** route handler in `app/api/` must check access via `requireSession` or `requireEducationPrivilege` (middleware only guards the module, not the operation). Scan all route handlers and find any endpoint that **forgot** the check, or checks it incompletely (e.g. missing the `scope`/`target` argument).

7. **`has_tasks` sync.**
   `stage_templates.has_tasks` must stay in sync with whether `stage_task_templates` rows exist for that stage; the docs flag it as a manual, forgettable invariant. Confirm whether it's kept in sync by code, by migration, or purely by hand — and where it could silently drift (which breaks task creation in `startProcess` / `completeStage`).

---

## Also scan: promised-but-possibly-missing

Check what the docs imply should exist but the code may lack. For each: **present / absent / partial**, with reference.

- **Notifications.** Tasks have `due_date`, `due_time`, `due_all_day`, and `recurrence_*`. Is there any mechanism that actually **notifies** anyone (reminders, overdue alerts, recurrence materialization)?
- **File storage.** `persons.photo_url` exists. Is there any Supabase Storage integration (upload, signed URLs), or is the URL just assumed to come from elsewhere?
- **Audit log for data changes.** `stage_actions` logs workflow actions only. Is there any audit trail for changes to **personal data** (`persons`, `education_journeys`, etc.)?
- **Input validation.** Is there a validation layer (Zod or similar) on API inputs, or do route handlers trust the request body?
- **Tests.** Any unit / integration / E2E tests at all — especially around the transaction-less workflow engine?
- **Observability.** Anything beyond `console` (Sentry, structured logging, error tracking)?
- **Concurrency.** What happens if two users complete the same stage simultaneously — last-write-wins, or is there any guard?

---

## Known FK / embed trap to watch for

The docs note that PostgreSQL does **not** rename FK constraints on `ALTER TABLE ... RENAME TO` (e.g. `applicant_profiles` → `education_journeys`, but the FK is still `applicant_profiles_person_id_fkey`). A Supabase embed with a wrong FK name **returns `null` silently instead of throwing**. While scanning, flag any `.select(...!fk_name(...))` embeds that may be silently returning null.

---

## Deliverable

End with a structured report:

**(A) Verification table** — one row per point above:

| # | Gap (per docs) | Status | Reality (code) | File:line |
|---|----------------|--------|----------------|-----------|

**(B) Confirmed real gaps** — only the ones you actually verified in code, sorted by risk (data-corruption / security first, cosmetic last). For each: what it is, why it matters, blast radius.

**(C) Recommendation** — continue from here or rewrite, and the **first three concrete steps** (cheapest-highest-impact first). Note which steps are safe to do on the single-branch-to-prod setup and which need a staging environment first.

Remember: **diagnosis only this round. Do not modify, migrate, or push anything.**
