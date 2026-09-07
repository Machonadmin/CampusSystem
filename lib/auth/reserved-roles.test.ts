import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import {
  RESERVED_ROLE_CODES,
  RESERVED_ROLE_CODE_REASONS,
  isReservedRoleCode,
  normalizeRoleCode,
  roleCodeChangeError,
} from './reserved-roles'

// ─── Part 1: the decision function ───────────────────────────────────────────

describe('reserved role codes — decision function', () => {
  it('the critical codes are reserved', () => {
    for (const code of ['superadmin', 'admin', 'campus_admin', 'hr_director']) {
      expect(RESERVED_ROLE_CODES.has(code), code).toBe(true)
      expect(isReservedRoleCode(code), code).toBe(true)
    }
  })

  it('every reserved code is canonical (trimmed, lowercase) and documented', () => {
    for (const code of RESERVED_ROLE_CODES) {
      expect(code).toBe(normalizeRoleCode(code))
      expect(code.length).toBeGreaterThan(0)
      expect(RESERVED_ROLE_CODE_REASONS[code]?.trim().length ?? 0).toBeGreaterThan(10)
    }
  })

  it('comparison is trim + case-insensitive, so look-alikes cannot slip past', () => {
    expect(isReservedRoleCode('Superadmin')).toBe(true)
    expect(isReservedRoleCode(' superadmin ')).toBe(true)
    expect(isReservedRoleCode('ADMIN')).toBe(true)
    expect(isReservedRoleCode('superadmin2')).toBe(false)
    expect(isReservedRoleCode('super_admin')).toBe(false)
  })

  it('non-strings / empty are not reserved (required-field validation handles them)', () => {
    expect(isReservedRoleCode('')).toBe(false)
    expect(isReservedRoleCode('   ')).toBe(false)
    expect(isReservedRoleCode(null)).toBe(false)
    expect(isReservedRoleCode(undefined)).toBe(false)
    expect(isReservedRoleCode(42)).toBe(false)
  })

  it('CREATE: reserved code → role_code_reserved; ordinary code → allowed', () => {
    expect(roleCodeChangeError('superadmin')).toBe('role_code_reserved')
    expect(roleCodeChangeError('Campus_Admin')).toBe('role_code_reserved')
    expect(roleCodeChangeError('admin')).toBe('role_code_reserved')
    expect(roleCodeChangeError('librarian')).toBeNull()
  })

  it('RENAME to a reserved code → role_code_reserved', () => {
    expect(roleCodeChangeError('superadmin', 'librarian')).toBe('role_code_reserved')
    expect(roleCodeChangeError('teacher', 'librarian')).toBe('role_code_reserved')
  })

  it('RENAME away from a reserved code → role_code_locked', () => {
    expect(roleCodeChangeError('boss', 'superadmin')).toBe('role_code_locked')
    expect(roleCodeChangeError('', 'superadmin')).toBe('role_code_locked')
    expect(roleCodeChangeError(null, 'superadmin')).toBe('role_code_locked')
  })

  it('RENAME between two reserved codes is refused as reserved (never allowed)', () => {
    expect(roleCodeChangeError('admin', 'superadmin')).toBe('role_code_reserved')
  })

  it('no-op (same code, any casing/whitespace) is allowed — the roles screen may resend the code unchanged', () => {
    expect(roleCodeChangeError('superadmin', 'superadmin')).toBeNull()
    expect(roleCodeChangeError(' Superadmin ', 'superadmin')).toBeNull()
    expect(roleCodeChangeError('librarian', 'librarian')).toBeNull()
  })

  it('RENAME between two ordinary codes is allowed', () => {
    expect(roleCodeChangeError('archivist', 'librarian')).toBeNull()
  })
})

// ─── Part 2: self-maintaining static scan ─────────────────────────────────────
//
// Walks the application sources and extracts every role code that is hardcoded
// in a permission/behaviour check, then asserts each one is reserved. If a
// future change adds e.g. `session.roles.includes('auditor')` without adding
// 'auditor' to lib/auth/reserved-roles.ts, this test fails and names the site.
//
// Recognised shapes (add a pattern here when you introduce a new shape):
//   1. <anything>.roles.includes('x') / roles?.includes('x') / roles!.includes('x')
//   2. roleCodes.get(id) === 'x'                       (app/api/staff/health)
//   3. .some(r => r === 'x' || r === 'y')              (lib/workflow/stage-access)
//   4. const FOO_ROLES = ['x', 'y'] / FOO_ROLE_CODES = new Set(['x'])
//
// The scan deliberately ignores `principal === 'student'` (a principal, not a
// role), education_status values, module codes and UI tab keys.

const ROOT = process.cwd()
const SCAN_ROOTS = ['app', 'lib', 'components']
const SCAN_FILES = ['middleware.ts']
const SKIP_FILES = new Set([
  'lib/auth/reserved-roles.ts',   // the source of truth itself
  'lib/i18n/translations.ts',     // display labels only, not checks
])
// `X_ROLES` arrays that are NOT application role codes (shape 4 would otherwise
// flag them). Classify explicitly — never silently — when adding one here.
const NOT_APP_ROLE_ARRAYS = new Set([
  // Roles a person holds in their home community (rav, shaliach…): a picker of
  // canonical Hebrew labels for a free-text field, not roles.code.
  'components/education/CommunityRoleSelect.tsx#COMMUNITY_ROLES',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

const rel = (f: string) => f.slice(ROOT.length + 1).split(sep).join('/')

interface Site { code: string; file: string; line: number; shape: string }

function extractSites(): Site[] {
  const files = [
    ...SCAN_ROOTS.flatMap(d => walk(join(ROOT, d))),
    ...SCAN_FILES.map(f => join(ROOT, f)),
  ].filter(f => !SKIP_FILES.has(rel(f)))

  const sites: Site[] = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const lines = src.split('\n')
    lines.forEach((text, i) => {
      const line = i + 1
      const push = (code: string, shape: string) => sites.push({ code, file: rel(file), line, shape })

      // 1. roles.includes('x')
      for (const m of text.matchAll(/\broles!?\??\.includes\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) push(m[1], 'roles.includes')

      // 2. roleCodes.get(...) === 'x'
      for (const m of text.matchAll(/roleCodes\.get\([^)]*\)\s*===\s*['"]([A-Za-z0-9_]+)['"]/g)) push(m[1], 'roleCodes.get ===')

      // 3. .some(r => r === 'x' || r === 'y')
      if (/\.some\(\s*r\s*=>/.test(text)) {
        for (const m of text.matchAll(/\br\s*===\s*['"]([A-Za-z0-9_]+)['"]/g)) push(m[1], 'some(r => r === )')
      }
    })

    // 4. FOO_ROLES = [...] / FOO_ROLE_CODES = new Set([...]) — the literal may span
    //    several lines (lib/roles/deprecated.ts), so this one scans the whole file.
    for (const arr of src.matchAll(/\b([A-Z_]*_ROLE(?:S|_CODES))\b[^=\n]*=\s*(?:new Set\()?\s*\[([^\]]*)\]/g)) {
      if (NOT_APP_ROLE_ARRAYS.has(`${rel(file)}#${arr[1]}`)) continue
      const line = src.slice(0, arr.index ?? 0).split('\n').length
      for (const m of arr[2].matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) {
        sites.push({ code: m[1], file: rel(file), line, shape: 'X_ROLES array' })
      }
    }
  }
  return sites
}

describe('reserved role codes — static scan of hardcoded role checks', () => {
  const sites = extractSites()

  it('the scan actually finds the known checks (guards against a vacuous scan)', () => {
    // If a refactor changes the shape of the checks, update the patterns above —
    // do not lower these floors.
    expect(sites.length).toBeGreaterThanOrEqual(150)
    const codes = new Set(sites.map(s => s.code))
    for (const must of ['superadmin', 'admin', 'hr_director', 'campus_admin', 'teacher', 'jewishness_officer']) {
      expect(codes.has(must), `expected the scan to find a hardcoded check on '${must}'`).toBe(true)
    }
    const files = new Set(sites.map(s => s.file))
    for (const must of [
      'middleware.ts',
      'lib/auth/landing.ts',
      'lib/roles/deprecated.ts',
      'lib/workflow/stage-access.ts',
      'app/api/settings/positions/route.ts',
      'app/api/staff/health/route.ts',
    ]) {
      expect(files.has(must), `expected the scan to cover ${must}`).toBe(true)
    }
  })

  it('every role code hardcoded in a check is reserved', () => {
    const missing = sites.filter(s => !RESERVED_ROLE_CODES.has(s.code))
    const report = missing.map(s => `${s.file}:${s.line}  '${s.code}'  (${s.shape})`).join('\n')
    expect(
      missing,
      `Hardcoded role-code checks whose code is NOT in lib/auth/reserved-roles.ts:\n${report}\n` +
      'Add the code (with a reason) to RESERVED_ROLE_CODE_REASONS, or — if the check ' +
      'should not exist — remove the check (an owner decision).',
    ).toEqual([])
  })

  it('every reserved code is still referenced by at least one check (no stale reservations)', () => {
    // Keeps the set honest in the other direction: a reservation whose check was
    // removed should be re-justified or dropped, not linger unexplained.
    const referenced = new Set(sites.map(s => s.code))
    const stale = [...RESERVED_ROLE_CODES].filter(c => !referenced.has(c))
    expect(stale, `reserved but no hardcoded check found: ${stale.join(', ')}`).toEqual([])
  })
})
