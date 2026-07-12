import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePersonsPrivilege } from '@/lib/persons/permissions'
import { mapDbError } from '@/lib/persons/http'

/**
 * GET /api/persons/staff
 *
 * ЧИТАЮЩИЙ справочник сотрудников: одна строка на человека, у которого есть
 * хотя бы одна ДЕЙСТВУЮЩАЯ должность (staff_positions.end_date IS NULL),
 * присоединённого к persons и departments. Для одного человека собираем все
 * его текущие должности; основная (is_head first) даёт отображаемую должность и
 * подразделение.
 *
 * Право: persons.view. Модуль НЕ владеет таблицами — только читает.
 *
 * Фильтры:
 *   ?search=...  — app-side по full_name/hebrew_name/email/phones/должностям
 *
 * Пагинация (app-side, после поиска):
 *   ?page=1&pageSize=50
 *
 * Ответ: { staff: PersonsStaffItem[], total, page, pageSize }
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Сотрудников кампуса
// может быть много; читаем должности постранично и суммируем, чтобы не потерять
// людей из справочника.
const PAGE = 1000
const DEFAULT_PAGE_SIZE = 50

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

interface PositionRow {
  person_id: string
  department_id: string
  position_ru: string | null
  is_head: boolean | null
}

export async function GET(request: NextRequest) {
  try {
    await requirePersonsPrivilege('view')

    const sb = createServerClient()

    // 1) Действующие должности — постранично (is_head first → основная должность
    //    и подразделение человека оказываются первыми в его группе).
    const positions: PositionRow[] = []
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('staff_positions')
        .select('person_id, department_id, position_ru, is_head')
        .is('end_date', null)
        .order('is_head', { ascending: false })
        .order('person_id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as PositionRow[]
      positions.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }

    if (positions.length === 0) {
      return NextResponse.json({ staff: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE })
    }

    const personIds = [...new Set(positions.map(p => p.person_id))]
    const deptIds = [...new Set(positions.map(p => p.department_id).filter(Boolean))]

    // 2) Персоны — чанкуем по personIds, чтобы .in() не обрезался на db-max-rows.
    const personMap = new Map<string, {
      id: string
      full_name: string | null
      hebrew_name: string | null
      email: string | null
      phones: unknown
      photo_url: string | null
    }>()
    for (let i = 0; i < personIds.length; i += PAGE) {
      const batch = personIds.slice(i, i + PAGE)
      const { data, error } = await sb
        .from('persons')
        .select('id, full_name, hebrew_name, email, phones, photo_url')
        .in('id', batch)
      if (error) throw error
      for (const p of data ?? []) personMap.set(p.id, p)
    }

    // 3) Подразделения.
    const deptMap = new Map<string, string>()
    for (let i = 0; i < deptIds.length; i += PAGE) {
      const batch = deptIds.slice(i, i + PAGE)
      const { data, error } = await sb
        .from('departments')
        .select('id, name')
        .in('id', batch)
      if (error) throw error
      for (const d of data ?? []) deptMap.set(d.id, d.name)
    }

    // 4) Сборка — одна строка на человека; должности агрегируем.
    interface Agg {
      person_id: string
      positions: string[]
      department: string | null
    }
    const aggMap = new Map<string, Agg>()
    for (const pos of positions) {
      if (!personMap.has(pos.person_id)) continue
      let agg = aggMap.get(pos.person_id)
      if (!agg) {
        // Первая должность в группе — основная (is_head first): её подразделение.
        agg = { person_id: pos.person_id, positions: [], department: deptMap.get(pos.department_id) ?? null }
        aggMap.set(pos.person_id, agg)
      }
      if (pos.position_ru && !agg.positions.includes(pos.position_ru)) {
        agg.positions.push(pos.position_ru)
      }
    }

    let staff = [...aggMap.values()].map(a => {
      const person = personMap.get(a.person_id)!
      return {
        person_id: a.person_id,
        full_name: person.full_name ?? '',
        hebrew_name: person.hebrew_name ?? null,
        position: a.positions[0] ?? null,
        positions: a.positions,
        department: a.department,
        email: person.email ?? null,
        phones: flattenPhones(person.phones),
        photo_url: person.photo_url ?? null,
      }
    })

    // 5) Поиск (app-side).
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase()
    if (search) {
      staff = staff.filter(s =>
        s.full_name.toLowerCase().includes(search) ||
        (s.hebrew_name ?? '').toLowerCase().includes(search) ||
        (s.email ?? '').toLowerCase().includes(search) ||
        s.phones.join(' ').toLowerCase().includes(search) ||
        s.positions.join(' ').toLowerCase().includes(search)
      )
    }

    staff.sort((a, b) => a.full_name.localeCompare(b.full_name))

    // 6) Пагинация (app-side).
    const total = staff.length
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE))
    const start = (page - 1) * pageSize
    const pageItems = staff.slice(start, start + pageSize)

    return NextResponse.json({ staff: pageItems, total, page, pageSize })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
