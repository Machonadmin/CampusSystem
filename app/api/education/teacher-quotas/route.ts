import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  canManageEducationInAny,
  canDoEducationInAny,
} from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { sumAssignedHoursByTeacher, computeRemaining, isOverQuota, type CourseHours } from '@/lib/education/teacher-quota'

/**
 * Часовые квоты преподавателей кодеша (spec §3.6). GET отдаёт по каждому
 * преподавателю (у кого есть квота ИЛИ кто ведёт курс кодеша): approved / assigned
 * / remaining / over(=превышение, только предупреждение §6.1). POST — задать/
 * обновить квоту (Moshe, set_teacher_quota).
 *
 * assigned = сумма class_groups.hours активных курсов кодеша преподавателя.
 * ⚠ Гранулярность по году/семестру приблизительная: assigned берётся по ВСЕМ
 * активным курсам кодеша (курсы не несут year_label напрямую).
 * Deploy-safe: нет таблиц/колонок → пусто/0.
 */

async function loadAssignedHours(sb: ReturnType<typeof createServerClient>): Promise<Map<string, number>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: courses, error } = await (sb.from('class_groups') as any)
      .select('id, hours')
      .eq('department_id', KODESH_DEPT_ID)
      .eq('is_active', true)
      .not('parent_semester_id', 'is', null)
    if (error) {
      if (error.code === '42703' || error.code === '42P01') return new Map()
      throw error
    }
    const rows = (courses ?? []) as Array<{ id: string; hours: number | null }>
    if (rows.length === 0) return new Map()
    const { data: ct, error: ctErr } = await sb
      .from('class_teachers').select('class_group_id, teacher_id').in('class_group_id', rows.map(r => r.id))
    if (ctErr) throw ctErr
    const teachersByCourse = new Map<string, string[]>()
    for (const r of (ct ?? []) as Array<{ class_group_id: string; teacher_id: string }>) {
      const arr = teachersByCourse.get(r.class_group_id) ?? []
      arr.push(r.teacher_id)
      teachersByCourse.set(r.class_group_id, arr)
    }
    const courseHours: CourseHours[] = rows.map(r => ({ hours: r.hours, teacherIds: teachersByCourse.get(r.id) ?? [] }))
    return sumAssignedHoursByTeacher(courseHours)
  } catch (e) {
    if ((e as { code?: string }).code === '42P01' || (e as { code?: string }).code === '42703') return new Map()
    throw e
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await canManageEducationInAny(session, 'manage_class_teachers'))
      || (await canDoEducationInAny(session, 'set_teacher_quota'))
    if (!allowed) return apiError('forbidden', 403)

    const year = new URL(request.url).searchParams.get('year')?.trim()
    const sb = createServerClient()

    const assigned = await loadAssignedHours(sb)

    let quotas: Array<{ id: string; teacher_id: string; year_label: string; term_number: number | null; approved_hours: number; source: string; note: string | null }> = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb.from('teacher_hour_quotas') as any).select('id, teacher_id, year_label, term_number, approved_hours, source, note')
      if (year) q = q.eq('year_label', year)
      const { data, error } = await q
      if (error) throw error
      quotas = (data ?? []) as typeof quotas
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }

    // Множество преподавателей: с квотой ∪ с назначенными часами.
    const teacherIds = new Set<string>([...quotas.map(q => q.teacher_id), ...assigned.keys()])
    const names = new Map<string, string>()
    if (teacherIds.size > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', [...teacherIds])
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        names.set(p.id, p.hebrew_name || p.full_name || '')
      }
    }
    const quotaByTeacher = new Map(quotas.map(q => [q.teacher_id, q]))

    const items = [...teacherIds].map(tid => {
      const q = quotaByTeacher.get(tid)
      const assignedHours = assigned.get(tid) ?? 0
      const approved = q ? Number(q.approved_hours) : null
      return {
        teacher_id: tid,
        name: names.get(tid) ?? '',
        quota_id: q?.id ?? null,
        approved_hours: approved,
        source: q?.source ?? null,
        term_number: q?.term_number ?? null,
        note: q?.note ?? null,
        assigned_hours: assignedHours,
        remaining: approved !== null ? computeRemaining(approved, assignedHours) : null,
        over: isOverQuota(approved, assignedHours),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ quotas: items })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const setSchema = z.object({
  teacher_id: z.string().uuid(),
  year_label: z.string().trim().min(1).max(20),
  term_number: z.number().int().min(1).max(4).nullish(),
  approved_hours: z.number().min(0).max(9999),
  source: z.enum(['contract', 'manual']).optional(),
  note: z.string().trim().max(2000).nullish(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, setSchema)
    const session = await requireEducationPrivilege('set_teacher_quota', { department_id: KODESH_DEPT_ID })
    const sb = createServerClient()
    const term = body.term_number ?? null

    // Upsert вручную (уникальный индекс на выражении COALESCE(term_number,-1) —
    // supabase onConflict его не таргетит). Ищем существующую строку и
    // null-безопасно сопоставляем term.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (sb.from('teacher_hour_quotas') as any)
      .select('id, term_number').eq('teacher_id', body.teacher_id).eq('year_label', body.year_label)
    if (existing.error) {
      if (existing.error.code === '42P01') return apiError('feature_not_migrated', 503)
      throw existing.error
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = ((existing.data ?? []) as any[]).find(r => (r.term_number ?? null) === term)
    const rowId: string | null = found?.id ?? null

    const payload = {
      teacher_id: body.teacher_id,
      year_label: body.year_label,
      term_number: term,
      approved_hours: body.approved_hours,
      source: body.source ?? 'manual',
      set_by: session.person_id,
      note: body.note ?? null,
    }
    if (rowId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from('teacher_hour_quotas') as any).update(payload).eq('id', rowId)
      if (error) throw error
      return NextResponse.json({ id: rowId })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('teacher_hour_quotas') as any).insert(payload).select('id').single()
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
