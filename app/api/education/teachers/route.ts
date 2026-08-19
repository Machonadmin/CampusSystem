import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { sanitizeOrSearch } from '@/lib/search/sanitize'

/**
 * GET /api/education/teachers
 *
 * Пикер преподавателей для модуля «Обучение» (курсы/семестры/группы).
 *
 * Зачем отдельный маршрут, а не /api/persons?role=teacher:
 * /api/persons требует привилегию модуля «Люди» (persons.view). У ролей
 * unit_manager / unit_secretary её нет — только привилегии модуля «Обучение».
 * Поэтому пикер преподавателей внутри «Обучения» отдавал 403, а PersonSelect
 * молча показывал «ничего не найдено». Здесь доступ гейтится образовательной
 * привилегией (как доска שיבוץ), и отдаётся ТОЛЬКО пул сотрудников (persons со
 * staff_position) — не весь справочник людей, чтобы не утекали PII студентов
 * других юнитов.
 *
 * Пул — все активные сотрудники по всей школе (owner: «доступ ко всем
 * преподавателям», т.к. один и тот же может преподавать в разных юнитах).
 * Тот же набор, что видит колонка преподавателей на доске שיבוץ.
 *
 * Поиск по full_name И hebrew_name (система на иврите: людей часто заводят с
 * ивритским именем в hebrew_name; поиск только по full_name их не находил).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    if (session.principal === 'student') return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const ok = session.roles.includes('superadmin')
      || await canDoEducationInAny(session, 'manage_class_teachers')
      || await canDoEducationInAny(session, 'manage_class_groups')
      || await canDoEducationInAny(session, 'manage_enrollments')
    if (!ok) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const q = sanitizeOrSearch(request.nextUrl.searchParams.get('search') ?? request.nextUrl.searchParams.get('q'))
    const idsParam = request.nextUrl.searchParams.get('ids')

    const sb = createServerClient()

    // Резолв по id — для показа имени уже назначенного преподавателя в пикере
    // (режим редактирования). Не ограничиваем активным staff_position: назначенный
    // ранее преподаватель мог завершить позицию, но его имя всё равно нужно.
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
      if (ids.length === 0) return NextResponse.json({ people: [] })
      const { data } = await sb
        .from('persons')
        .select('id, full_name, hebrew_name, email, phones')
        .in('id', ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const people = (data ?? []).map((p: any) => ({
        id: p.id,
        full_name: (p.full_name || p.hebrew_name || '').trim(),
        email: p.email ?? null,
        phone: Array.isArray(p.phones) && p.phones.length > 0 ? (p.phones[0]?.number ?? null) : null,
      }))
      return NextResponse.json({ people })
    }

    // Пул: активные staff_positions → person_id (вся школа).
    const { data: spRows } = await sb.from('staff_positions').select('person_id').is('end_date', null)
    const staffPersonIds = [...new Set((spRows ?? []).map((r: { person_id: string }) => r.person_id))]
    if (staffPersonIds.length === 0) return NextResponse.json({ people: [] })

    let qb = sb
      .from('persons')
      .select('id, full_name, hebrew_name, email, phones')
      .in('id', staffPersonIds)
      .order('full_name')
      .limit(50)
    if (q.length >= 2) qb = qb.or(`full_name.ilike.%${q}%,hebrew_name.ilike.%${q}%,email.ilike.%${q}%`)

    const { data } = await qb
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const people = (data ?? []).map((p: any) => ({
      id: p.id,
      full_name: (p.full_name || p.hebrew_name || '').trim(),
      email: p.email ?? null,
      phone: Array.isArray(p.phones) && p.phones.length > 0 ? (p.phones[0]?.number ?? null) : null,
    }))

    return NextResponse.json({ people })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
