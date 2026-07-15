import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { parseFlexibleDate, splitFullName, normalizeGender, dedupeKey } from '@/lib/education/import-map'

/**
 * POST /api/education/students/import
 *
 * Массовый импорт студенток из внешнего файла (уже размапленные клиентом
 * строки). Создаёт person + education_journey(education_status='student').
 * Нормализация (дата ДД.ММ.ГГГГ, ФИО, пол) — на сервере (чистые помощники).
 *
 * dry_run=true — НИЧЕГО не пишет, только считает, что произойдёт (create /
 * duplicate / error). Дедуп: в пределах батча по dedupeKey; в БД — по
 * (first_name+last_name+birth_date), когда все три есть.
 *
 * Право: superadmin или manage_students (массовое создание студенток).
 */

interface RawRow {
  full_name?: string; first_name?: string; last_name?: string; middle_name?: string
  hebrew_name?: string; gender?: string; birth_date?: string; phone?: string
  email?: string; city?: string; country?: string; passport_number?: string; note?: string
}

interface Normalized {
  first_name: string; last_name: string | null; middle_name: string | null
  hebrew_name: string | null; gender: 'male' | 'female' | null; birth_date: string | null
  phone: string | null; email: string | null; city: string | null; country: string | null
  passport_number: string | null; note: string | null
}

function normalize(r: RawRow): Normalized {
  const split = splitFullName(r.full_name)
  const first = (r.first_name ?? '').trim() || split.first_name
  const last = (r.last_name ?? '').trim() || split.last_name
  const middle = (r.middle_name ?? '').trim() || split.middle_name
  return {
    first_name: first,
    last_name: last || null,
    middle_name: middle || null,
    hebrew_name: (r.hebrew_name ?? '').trim() || null,
    gender: normalizeGender(r.gender),
    birth_date: parseFlexibleDate(r.birth_date),
    phone: (r.phone ?? '').trim() || null,
    email: (r.email ?? '').trim() || null,
    city: (r.city ?? '').trim() || null,
    country: (r.country ?? '').trim() || null,
    passport_number: (r.passport_number ?? '').trim() || null,
    note: (r.note ?? '').trim() || null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    if (!isSuper && !(await hasEducationPrivilege(session, 'manage_students'))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { rows?: RawRow[]; dry_run?: boolean }
    const rows = Array.isArray(body.rows) ? body.rows : []
    const dryRun = body.dry_run !== false // по умолчанию безопасно: dry-run
    if (rows.length === 0) return apiError('entries_required_nonempty', 400)
    if (rows.length > 2000) return apiError('too_many_rows', 400)

    const sb = createServerClient()
    const today = new Date().toISOString().slice(0, 10)

    const results: Array<{ index: number; name: string; action: 'create' | 'duplicate' | 'error'; message?: string }> = []
    const seen = new Set<string>()
    let created = 0, duplicates = 0, errors = 0

    for (let i = 0; i < rows.length; i++) {
      const n = normalize(rows[i])
      const display = [n.last_name, n.first_name].filter(Boolean).join(' ') || n.first_name || `#${i + 1}`

      if (!n.first_name) {
        results.push({ index: i, name: display, action: 'error', message: serverT('import_name_required') })
        errors++; continue
      }

      // Дедуп в пределах батча.
      const key = dedupeKey(n)
      if (key && seen.has(key)) {
        results.push({ index: i, name: display, action: 'duplicate', message: serverT('import_dup_in_file') })
        duplicates++; continue
      }
      if (key) seen.add(key)

      // Дедуп в БД по имени+фамилии+дате рождения (когда все три есть).
      let existsInDb = false
      if (n.last_name && n.birth_date) {
        const { data: exist } = await sb
          .from('persons').select('id')
          .eq('first_name', n.first_name).eq('last_name', n.last_name).eq('birth_date', n.birth_date)
          .limit(1)
        existsInDb = (exist ?? []).length > 0
      }
      if (existsInDb) {
        results.push({ index: i, name: display, action: 'duplicate', message: serverT('import_dup_in_db') })
        duplicates++; continue
      }

      if (dryRun) {
        results.push({ index: i, name: display, action: 'create' })
        created++; continue
      }

      // Реальное создание: person + journey(student).
      try {
        const { data: person, error: pErr } = await sb
          .from('persons')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            last_name: n.last_name,
            first_name: n.first_name,
            middle_name: n.middle_name,
            hebrew_name: n.hebrew_name,
            phones: n.phone ? [n.phone] : [],
            email: n.email,
            gender: n.gender,
            birth_date: n.birth_date,
            address: n.city ? { city: n.city } : null,
            nationality: n.country,
            passport_number: n.passport_number,
            notes: null,
          } as any)
          .select('id').single()
        if (pErr || !person) throw pErr ?? new Error('person')

        const { error: jErr } = await sb
          .from('education_journeys')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            person_id: person.id,
            education_status: 'student',
            opened_at: today,
            application_date: today,
            notes: n.note,
          } as any)
        if (jErr) throw jErr

        results.push({ index: i, name: display, action: 'create' })
        created++
      } catch (rowErr: unknown) {
        const m = (rowErr as { message?: string }).message ?? 'error'
        results.push({ index: i, name: display, action: 'error', message: m })
        errors++
      }
    }

    return NextResponse.json({
      dry_run: dryRun,
      summary: { total: rows.length, created, duplicates, errors },
      results,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
