import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { sanitizeOrSearch } from '@/lib/search/sanitize'

/**
 * GET /api/search?q= — глобальный поиск людей (по ФИО / ивр. имени / email).
 * Возвращает до 12 результатов с типом (лид/абитуриентка/студентка/сотрудник)
 * и ссылкой. Право: superadmin или любое из education view_leads/view_applicants/
 * view_students (те, кто работает с людьми приёма). ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ —
 * поэтому за гейтом.
 */

const STATUS_TO_STAGE = new Set(['lead', 'applicant'])

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
      while (list.length < 12 && from < PAGE * 5) {
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
            if (list.length >= 12) break
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
        .limit(12)
      if (error) throw error
      list = (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null; email: string | null }>
    }
    if (list.length === 0) return NextResponse.json({ results: [] })

    // Статус в образовании (для типа + ссылки).
    const { data: journeys } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status')
      .in('person_id', list.map(p => p.id))
    const journeyByPerson = new Map<string, { id: string; education_status: string | null }>()
    for (const j of (journeys ?? []) as Array<{ id: string; person_id: string; education_status: string | null }>) {
      if (!journeyByPerson.has(j.person_id)) journeyByPerson.set(j.person_id, { id: j.id, education_status: j.education_status })
    }

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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
