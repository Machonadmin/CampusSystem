// ─── Reserved role codes ──────────────────────────────────────────────────────
//
// Role codes are FREE TEXT in this system: the "Roles & privileges" screen lets a
// superadmin type any code into POST /api/settings/roles, and
// PATCH /api/settings/roles/[id] can rename one. But the application hardcodes
// specific codes in permission and behaviour checks —
// `session.roles.includes('superadmin')`, `isAdmin()` in the positions routes,
// the jewishness stage sign-off rule, unit-member classification, and so on.
// Without a guard, creating (or renaming a role to) one of those codes would
// silently hand that behaviour to whoever holds the new role.
//
// This module is the SINGLE SOURCE OF TRUTH for the codes the application
// treats specially:
//   • both role-admin routes refuse to create or rename a role TO a reserved
//     code, and refuse to rename a reserved role AWAY from its code (that would
//     break every check that looks for it — e.g. renaming `superadmin` would
//     lock every administrator out);
//   • lib/auth/reserved-roles.test.ts statically scans app/, lib/, components/
//     and middleware.ts for hardcoded role-code checks, so a future check whose
//     code is missing here fails the test suite and reminds the developer.
//
// Reserving a code does NOT touch existing rows: a role that already carries a
// reserved code keeps working exactly as before. Codes are compared after
// trim + lowercase, so `Superadmin` or ` superadmin ` cannot slip past.
//
// Client-safe: no server imports (the roles screen may use it for early UX).

/**
 * Every reserved code with the reason it is reserved (where the application
 * hardcodes it). Keep the reason precise — it is the documentation.
 */
export const RESERVED_ROLE_CODE_REASONS: Readonly<Record<string, string>> = {
  // ── Universal administrator ──────────────────────────────────────────────
  superadmin:
    'Universal bypass: middleware, every module/privilege check, every settings ' +
    'guard, impersonation, dev-login (~140 `roles.includes` sites in ~120 files).',

  // ── Hardcoded in live permission checks ──────────────────────────────────
  admin:
    'isAdmin() in app/api/settings/positions/route.ts and [id]/route.ts grants ' +
    'positions CRUD. No migration seeds this code; the check itself is pending an ' +
    'owner decision (PROJECT_STATUS.md §25 Q4 follow-up) — reserving it closes ' +
    'the hook meanwhile.',
  hr_director:
    'isAdmin() in app/api/settings/positions/route.ts and [id]/route.ts grants ' +
    'positions CRUD.',
  campus_admin:
    'HISTORICAL (no live check — see RESERVED_WITHOUT_LIVE_CHECK): until the §25 Q4 ' +
    'cleanup, hasBroaderAdminRole() in lib/auth/landing.ts treated it as a ' +
    'campus-wide admin for post-login landing / the §10 kodesh workspace. Seeded ' +
    'only by migration 001 and wiped by the TRUNCATE in 002; nothing re-seeds it. ' +
    'Still reserved so the code cannot be re-created from the roles screen and ' +
    'silently look like a campus admin (its display labels still exist in ' +
    'lib/i18n/translations.ts).',
  school_director:
    'isManager in app/api/workflow/signatures/route.ts reveals private stage ' +
    'notes; also a legacy code hidden from pickers (lib/roles/deprecated.ts).',
  jewishness_officer:
    'lib/workflow/stage-access.ts: a stage requiring this role may be signed by ' +
    'any holder of jewishness-module access.',
  jewish_studies_manager:
    'lib/workflow/stage-access.ts: same jewishness stage sign-off rule.',

  // ── Hardcoded in behaviour (classification / assignment / recipients) ────
  teacher:
    'app/api/education/units/[unitId]/members/route.ts classifies unit members ' +
    'and assigns this role by code.',
  studies_secretary:
    'app/api/education/units/[unitId]/members/route.ts classifies unit members ' +
    'and assigns this role by code (secretary / deputy).',
  finance_director:
    'lib/finance/notify-semester-opened.ts: recipient of the "semester opened" ' +
    'notification.',
  accountant:
    'lib/finance/notify-semester-opened.ts: recipient of the "semester opened" ' +
    'notification.',
  maintenance_head:
    'lib/tasks/maintenance-link.ts (MAINTENANCE_ROLE_CODES): holding this code marks ' +
    'a person as maintenance staff, which is what lets a task be flagged "maintenance ' +
    'work" and appear on the Maintenance board. It is no longer the ONLY signal ' +
    '(maintenance.manage counts too, see lib/maintenance/staff-server.ts), but the ' +
    'code is still read directly, so re-creating it elsewhere would put arbitrary ' +
    'tasks on that board.',
  maintenance_staff:
    'lib/tasks/maintenance-link.ts (MAINTENANCE_ROLE_CODES): same rule as ' +
    'maintenance_head — the code is read directly as a maintenance-staff marker.',

  // ── Legacy "university model" codes with hardcoded UI behaviour ──────────
  // lib/roles/deprecated.ts hides these from role pickers and the roles screen.
  // Re-creating one would produce a role that silently vanishes from the UI.
  rector: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
  dean: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
  vice_director: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
  dept_head: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
  program_head: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
  curator: 'Legacy code hidden from pickers (lib/roles/deprecated.ts).',
}

/**
 * Codes reserved WITHOUT a live hardcoded check: the check they protected was
 * deliberately removed, but the code stays reserved so it cannot be re-created
 * from the roles screen and quietly regain its old meaning. Every entry must
 * still carry a reason above, and it is exempt from the "no stale reservations"
 * test — which otherwise requires each reserved code to be found by the static
 * scan of hardcoded checks.
 */
export const RESERVED_WITHOUT_LIVE_CHECK: ReadonlySet<string> = new Set([
  // §25 Q4 removed it from hasBroaderAdminRole() (lib/auth/landing.ts).
  'campus_admin',
])

/** The reserved set itself (canonical form: trimmed, lowercase). */
export const RESERVED_ROLE_CODES: ReadonlySet<string> = new Set(
  Object.keys(RESERVED_ROLE_CODE_REASONS),
)

/** Canonical form used for every comparison: trimmed + lowercase; '' for non-strings. */
export function normalizeRoleCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toLowerCase() : ''
}

export function isReservedRoleCode(code: unknown): boolean {
  const c = normalizeRoleCode(code)
  return c.length > 0 && RESERVED_ROLE_CODES.has(c)
}

/**
 * Error code (i18n key in the `errors` namespace) for a create/rename, or null
 * when the change is allowed.
 *
 *   roleCodeChangeError(newCode)               — CREATE
 *   roleCodeChangeError(newCode, currentCode)  — RENAME (currentCode = stored today)
 *
 * - `role_code_reserved`: the requested code is reserved (create or rename-to).
 * - `role_code_locked`:   the role currently carries a reserved code and the
 *                         request would change it (rename-away).
 * - null:                 allowed — including a no-op where the code is unchanged.
 *
 * Fail-closed by construction: any reserved code on either side blocks, and the
 * caller must treat a non-null result as a refusal BEFORE touching the database.
 */
export type RoleCodeChangeError = 'role_code_reserved' | 'role_code_locked'

export function roleCodeChangeError(
  newCode: unknown,
  currentCode?: string | null,
): RoleCodeChangeError | null {
  const next = normalizeRoleCode(newCode)
  const current = normalizeRoleCode(currentCode)
  if (current.length > 0 && next === current) return null
  if (RESERVED_ROLE_CODES.has(next)) return 'role_code_reserved'
  if (RESERVED_ROLE_CODES.has(current)) return 'role_code_locked'
  return null
}
