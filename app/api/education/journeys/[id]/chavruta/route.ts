import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { shapeChavrutaSessionForViewer } from '@/lib/chavruta/view'

/**
 * GET /api/education/journeys/[id]/chavruta
 *
 * История хавруты ученицы: дата + имя моры + что учили (summary). Синхронизация
 * «с кем ты сидишь» видна и самой ученице (в портале), и сотрудникам её карточки.
 *
 * Право просмотра списка: студентка — только своя journey; staff — view_students
 * в подразделении ученицы (или superadmin).
 *
 * ПРИВАТНОСТЬ (инвариант): private_notes (личные заметки моры) — НЕ для ученицы
 * НИКОГДА. Среди сотрудников: их видит менеджер (manage_students / superadmin) и
 * САМА автор записи (своя заметка); прочим сотрудникам с одним view_students —
 * нет. Решается по каждой строке отдельно. Деплой-безопасно.
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    let canSeeAnyPrivate = false   // менеджер: видит личные заметки всех мор
    let viewerPersonId: string | null = null
    if (session.principal === 'student') {
      if (session.student_journey_id !== params.id) return apiError('forbidden', 403)
    } else {
      const target = await journeyDeptTarget(sb, params.id)
      const isSuper = session.roles.includes('superadmin')
      const allowed = isSuper || await hasEducationPrivilege(session, 'view_students', target)
      if (!allowed) return apiError('forbidden', 403)
      canSeeAnyPrivate = isSuper || await hasEducationPrivilege(session, 'manage_students', target)
      viewerPersonId = session.person_id
    }

    // Записи хавруты этой ученицы.
    let rows: Array<{ id: string; entry_date: string | null; amount: number | null; summary: string | null; private_notes: string | null; person_id: string; created_at: string | null }>
    try {
      const { data, error } = await u(sb).from('staff_work_entries')
        .select('id, entry_date, amount, summary, private_notes, person_id, created_at')
        .eq('student_journey_id', params.id).eq('entry_type', 'chavruta')
        .order('entry_date', { ascending: false })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ sessions: [] })
      throw e
    }

    // Имена мор.
    const teacherIds = [...new Set(rows.map(r => r.person_id).filter(Boolean))]
    const nameById = new Map<string, string>()
    if (teacherIds.length) {
      const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', teacherIds)
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }

    const sessions = rows.map(r => shapeChavrutaSessionForViewer({
      id: r.id,
      entry_date: r.entry_date,
      teacher_name: nameById.get(r.person_id) ?? '',
      summary: r.summary,
      private_notes: r.private_notes,
      // Менеджер — все; автор — свою; ученица — никогда.
    }, { isStaff: canSeeAnyPrivate || (viewerPersonId != null && r.person_id === viewerPersonId) }))

    return NextResponse.json({ sessions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
