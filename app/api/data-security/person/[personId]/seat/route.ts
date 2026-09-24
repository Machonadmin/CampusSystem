import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { clearDataSecurityPermissionsCache } from '@/lib/data-security/permissions'
import { loadPersonAccess } from '@/lib/data-security/load'

/**
 * Посадка сотрудника в учебные единицы.
 *
 * Это ГРАНИЦА его доступа: посаженный на единицу видит её и всё, что ниже.
 * Отсюда и запрошенный владельцем сценарий: руководитель сидит на «Колледже» и
 * видит оба потока, а секретарь сидит на «Колледж · 3 года» и видит только его.
 *
 * ⚠ Запись здесь меняет доступ ПО-НАСТОЯЩЕМУ, не выдавая при этом ни одного
 * права, — поэтому право отдельное (data_security.manage_units, critical).
 *
 * PUT { units: [{ department_id, is_head, position_he? }] } — заменяет набор
 * ДЕЙСТВУЮЩИХ посадок. Прошлые должности (с end_date) не трогаются: это
 * история человека, и стирать её нельзя.
 */

interface SeatBody {
  units?: { department_id: string; is_head?: boolean; position_he?: string | null }[]
}

export async function PUT(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await requireDataSecurityPrivilege('manage_units')
    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })
    const personId = params.personId
    if (!personId) return apiError('invalid_reference', 400)

    const { units } = await request.json() as SeatBody
    if (!Array.isArray(units)) return apiError('invalid_reference', 400)

    const wanted = units.filter(u => u.department_id)

    // Единица должна существовать: посадка на исчезнувшую не даст ничего, но
    // на экране будет выглядеть выданным доступом.
    if (wanted.length > 0) {
      const { data: known } = await sb
        .from('departments')
        .select('id')
        .in('id', wanted.map(u => u.department_id))
      const knownIds = new Set((known ?? []).map(d => d.id))
      if (wanted.some(u => !knownIds.has(u.department_id))) {
        return apiError('invalid_reference', 400)
      }
    }

    const today = todayISO()

    const { data: current, error: readErr } = await sb
      .from('staff_positions')
      .select('id, department_id, is_head, end_date, position_ru, position_he')
      .eq('person_id', personId)
    if (readErr) throw readErr

    const active = (current ?? []).filter(p => p.end_date === null || p.end_date > today)
    const wantedIds = new Set(wanted.map(u => u.department_id))

    // Снятые единицы ЗАКРЫВАЮТСЯ датой, а не удаляются: staff_positions — это
    // ещё и трудовая история, и удаление строки стёрло бы её беззвучно.
    const toClose = active.filter(p => !wantedIds.has(p.department_id))
    for (const p of toClose) {
      const { error } = await sb.from('staff_positions').update({ end_date: today }).eq('id', p.id)
      if (error) throw error
    }

    for (const u of wanted) {
      const existing = active.find(p => p.department_id === u.department_id)
      if (existing) {
        if (existing.is_head !== !!u.is_head) {
          const { error } = await sb
            .from('staff_positions')
            .update({ is_head: !!u.is_head })
            .eq('id', existing.id)
          if (error) throw error
        }
        continue
      }
      // position_ru в таблице NOT NULL. Должность как ТЕКСТ здесь не
      // придумывается: если её не передали, ставим подпись единицы — экран
      // всё равно показывает единицу, а не эту строку.
      const { data: dept } = await sb
        .from('departments')
        .select('name, name_he')
        .eq('id', u.department_id)
        .maybeSingle()
      const { error } = await sb.from('staff_positions').insert({
        person_id: personId,
        department_id: u.department_id,
        position_ru: dept?.name ?? '—',
        position_he: u.position_he?.trim() || dept?.name_he || null,
        position_id: null,
        is_head: !!u.is_head,
        start_date: today,
        end_date: null,
      })
      if (error) throw error
    }

    // Область считается из посадки и кэшируется на 30 секунд — без сброса
    // администратор увидел бы старую картину и решил, что не сохранилось.
    clearDataSecurityPermissionsCache(personId)

    const access = await loadPersonAccess(personId, getCookieLocale())
    return NextResponse.json(access)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
