import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, type EducationPrivilege } from '@/lib/education/permissions'
import { hasPersonsPrivilege, getPersonsPrivilegeScope } from '@/lib/persons/permissions'
import { journeyTarget } from '@/lib/education/journey-target'
import { sanitizeOrSearch } from '@/lib/search/sanitize'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/search?q= — глобальный поиск людей (по ФИО / ивр. имени / email).
 * Возвращает до 12 результатов с типом (лид/абитуриентка/студентка/сотрудник)
 * и ссылкой. Право: superadmin или любое из education view_leads/view_applicants/
 * view_students (те, кто работает с людьми приёма). ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ —
 * поэтому за гейтом.
 */

const STATUS_TO_STAGE = new Set(['lead', 'applicant'])
// Кандидатов берём с запасом: часть отсеется проверкой прав по объекту.
const CANDIDATES = 60

function viewPrivilegeFor(status: string | null): EducationPrivilege {
  if (status === 'lead') return 'view_leads'
  if (status === 'applicant') return 'view_applicants'
  return 'view_students'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_leads')
      || await hasEducationPrivilege(session, 'view_applicants')
      || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return NextResponse.json({ results: [] })

    const rawQ = request.nextUrl.searchParams.get('q') ?? ''
    const q = sanitizeOrSearch(rawQ)
    if (q.length < 2) return NextResponse.json({ results: [] })

    const sb = createServerClient()

    // Поиск по НОМЕРУ ТЕЛЕФОНА: незнакомый номер звонит в офис — секретарь
    // вставляет его в поиск и сразу видит, кто это. phones — JSONB-массив,
    // ilike в .or() по нему не работает, поэтому цифровой запрос ищем
    // app-side по нормализованным цифрам (ведущие 972/0 отбрасываем с обеих
    // сторон, чтобы «052…», «+972 52…» и «52…» находили друг друга).
    const digits = rawQ.replace(/\D/g, '')
    const isPhoneQuery = digits.length >= 5 && digits.length * 2 >= rawQ.trim().length
    let list: Array<{ id: string; full_name: string | null; hebrew_name: string | null; email: string | null }> = []
    if (isPhoneQuery) {
      const norm = (s: string) => s.replace(/\D/g, '').replace(/^972/, '').replace(/^0/, '')
      const needle = norm(digits)
      const PAGE = 1000
      let from = 0
      // Кап в 5 страниц — защита от неограниченного скана на больших базах.
      while (list.length < CANDIDATES && from < PAGE * 5) {
        const { data, error } = await sb
          .from('persons')
          .select('id, full_name, hebrew_name, email, phones')
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const rows = (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null; email: string | null; phones: unknown }>
        for (const p of rows) {
          const phones = Array.isArray(p.phones) ? p.phones : []
          const hit = phones.some(ph => {
            const n = typeof ph === 'string' ? ph : (ph as { number?: string })?.number ?? ''
            return norm(String(n)).includes(needle)
          })
          if (hit) {
            list.push({ id: p.id, full_name: p.full_name, hebrew_name: p.hebrew_name, email: p.email })
            if (list.length >= CANDIDATES) break
          }
        }
        if (rows.length < PAGE) break
        from += PAGE
      }
    } else {
      const pattern = `%${q}%`
      const { data: persons, error } = await sb
        .from('persons')
        .select('id, full_name, hebrew_name, email')
        .or(`full_name.ilike.${pattern},hebrew_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(CANDIDATES)
      if (error) throw error
      list = (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null; email: string | null }>
    }
    if (list.length === 0) return NextResponse.json({ results: [] })

    // Статус в образовании (для типа + ссылки).
    type JRow = { id: string; person_id: string; education_status: string | null; primary_department_id: string | null; desired_department_id: string | null }
    const { data: journeys } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status, primary_department_id, desired_department_id')
      .in('person_id', list.map(p => p.id))
    const journeysByPerson = new Map<string, JRow[]>()
    for (const j of (journeys ?? []) as JRow[]) {
      const arr = journeysByPerson.get(j.person_id) ?? []
      arr.push(j)
      journeysByPerson.set(j.person_id, arr)
    }

    // Проверка по ОБЪЕКТУ (red-team 2026-09-25): раньше право просмотра в одном
    // юните давало поиск (в т.ч. обратный по телефону) по ВСЕМУ институту.
    // Человек виден, если: persons.view='all' / superadmin; либо видна хотя бы
    // одна его journey (право по статусу в её подразделении, journeyTarget);
    // человек без journey (сотрудник) — только с правом persons.view.
    const unrestricted = session.roles.includes('superadmin')
      || (await getPersonsPrivilegeScope(session, 'view')) === 'all'
    const canViewPersons = unrestricted || await hasPersonsPrivilege(session, 'view')
    const journeyByPerson = new Map<string, { id: string; education_status: string | null }>()
    const visible: typeof list = []
    for (const p of list) {
      const js = journeysByPerson.get(p.id) ?? []
      let shown: JRow | null = null
      for (const j of js) {
        if (unrestricted) { shown = j; break }
        const priv = viewPrivilegeFor(j.education_status)
        const scope = await getEducationPrivilegeScope(session, priv)
        if (scope === 'own') continue
        if (await hasEducationPrivilege(session, priv, journeyTarget(j))) { shown = j; break }
      }
      if (shown) journeyByPerson.set(p.id, { id: shown.id, education_status: shown.education_status })
      if (shown || (js.length === 0 && canViewPersons)) visible.push(p)
      if (visible.length >= 12) break
    }
    list = visible
    if (list.length === 0) return NextResponse.json({ results: [] })

    const results = list.map(p => {
      const j = journeyByPerson.get(p.id)
      const status = j?.education_status ?? 'staff'
      let link = `/dashboard/persons/${p.id}`
      if (j) {
        link = status === 'student'
          ? `/dashboard/education/students/${j.id}`
          : STATUS_TO_STAGE.has(status)
            ? `/dashboard/education/leads/${j.id}`
            : `/dashboard/education/students/${j.id}`
      }
      return {
        person_id: p.id,
        name: p.hebrew_name || p.full_name || '—',
        hebrew_name: p.hebrew_name,
        email: p.email,
        status,
        link,
      }
    })

    return NextResponse.json({ results })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
