import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { effectiveTeacherIds, intervalsOverlap, timeToSeconds } from '@/lib/education/slot-fields'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/education/teachers/availability
 *   ?day_of_week=1..7 &start_time=HH:MM &end_time=HH:MM [&exclude_slot_id=<uuid>]
 *
 * Кто из преподавателей УЖЕ ЗАНЯТ в это окно — чтобы форма урока помечала их
 * «תפוס» ДО сохранения, а не сообщала о конфликте постфактум.
 *
 * Ключевое: выборка идёт по ВСЕМУ кампусу и НЕ ограничена подразделением.
 * Ровно в этом смысл: преподаватель, закреплённый и за колледжем, и за
 * иудаикой, уже занятый в одном юните, должен показываться занятым и во втором.
 *
 * Занятость считается по ДЕЙСТВУЮЩЕМУ преподавателю слота (свой teacher_id,
 * иначе все преподаватели группы) — тем же правилом, что и двойное
 * бронирование, иначе пикер и проверка при сохранении расходились бы.
 *
 * Право: view_students (любой scope) — та же планка, что и на просмотр сетки
 * расписания. Ответ не раскрывает ничего сверх неё: только имена групп.
 */

const PAGE = 1000

interface SlotRow {
  id: string
  class_group_id: string
  start_time: string
  end_time: string
  approval_status?: string
  teacher_id?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    if (!isSuper && !(await hasEducationPrivilege(session, 'view_students'))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const dow = Number(sp.get('day_of_week'))
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) return apiError('day_of_week_1_7', 400)
    const startSec = timeToSeconds(sp.get('start_time'))
    const endSec = timeToSeconds(sp.get('end_time'))
    if (startSec === null || endSec === null) return apiError('invalid_time_format', 400)
    if (endSec <= startSec) return apiError('end_after_start', 400)
    const excludeSlotId = (sp.get('exclude_slot_id') ?? '').trim()

    const sb = createServerClient()

    // Слоты этого дня недели, постранично: без .range() PostgREST молча срежет
    // выборку, и часть занятости просто не увиделась бы.
    // select('*') — деплой-безопасно к teacher_id (миграция 20260915120000).
    const rows: SlotRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('class_schedule_slots')
        .select('*')
        .eq('day_of_week', dow)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as unknown as SlotRow[]
      rows.push(...page)
      if (page.length < PAGE) break
    }

    const overlapping = rows.filter(s => {
      if (excludeSlotId && s.id === excludeSlotId) return false
      // Отклонённый слот никого не занимает; 'pending' — занимает (место уже
      // запрошено, и предупредить о нём честнее, чем промолчать).
      if ((s.approval_status ?? 'active') === 'rejected') return false
      const os = timeToSeconds(s.start_time)
      const oe = timeToSeconds(s.end_time)
      if (os === null || oe === null) return false
      return intervalsOverlap(startSec, endSec, os, oe)
    })

    if (overlapping.length === 0) return NextResponse.json({ busy: [] })

    const groupIds = [...new Set(overlapping.map(s => s.class_group_id))]
    const groupNameById = new Map<string, string>()
    {
      const { data } = await sb.from('class_groups').select('id, name').in('id', groupIds)
      for (const g of (data ?? []) as Array<{ id: string; name: string }>) groupNameById.set(g.id, g.name)
    }

    // Преподаватели групп — нужны только для слотов без собственного teacher_id.
    const teachersByGroup = new Map<string, string[]>()
    {
      const { data } = await sb.from('class_teachers').select('class_group_id, teacher_id').in('class_group_id', groupIds)
      for (const r of (data ?? []) as Array<{ class_group_id: string; teacher_id: string }>) {
        const a = teachersByGroup.get(r.class_group_id) ?? []
        a.push(r.teacher_id); teachersByGroup.set(r.class_group_id, a)
      }
    }

    // Один преподаватель — одна запись; имя группы берём от первого совпадения,
    // этого достаточно, чтобы объяснить, ЧЕМ он занят.
    const busyByPerson = new Map<string, string>()
    for (const s of overlapping) {
      const gname = groupNameById.get(s.class_group_id) ?? ''
      for (const tid of effectiveTeacherIds(s.teacher_id, teachersByGroup.get(s.class_group_id) ?? [])) {
        if (!busyByPerson.has(tid)) busyByPerson.set(tid, gname)
      }
    }

    return NextResponse.json({
      busy: [...busyByPerson].map(([person_id, group_name]) => ({ person_id, group_name })),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
