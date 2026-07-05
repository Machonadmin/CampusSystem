import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * POST /api/education/journeys/[id]/transition
 *
 * Смена education_status студента по учебному циклу:
 *   student  → on_leave  (академический отпуск)  — нужны reason + effective_date
 *   on_leave → student   (возврат из отпуска)     — без reason/date
 *   student  → graduated (выпуск)                 — нужны reason + effective_date
 *   student  → expelled  (отчисление)             — нужны reason + effective_date
 *
 * Право: manage_students в primary_department студента.
 *
 * Атомарность (смена статуса + запись person_status_history) обеспечивается
 * RPC transition_education_status — тот же паттерн, что у конверсий движка.
 * Требует применённых миграций 20260705120000 / 20260705120100.
 *
 * Body: { to_status: 'on_leave'|'student'|'graduated'|'expelled', reason?, effective_date? }
 */

const ALLOWED_TARGETS = ['on_leave', 'student', 'graduated', 'expelled'] as const
type TargetStatus = (typeof ALLOWED_TARGETS)[number]

function mapPgError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === 'P0002') return { status: 404, message: 'Journey не найден' }
  if (error.code === '22023') return { status: 400, message: error.message ?? 'Недопустимый переход' }
  if (error.code === '22P02') return { status: 400, message: 'Неподдерживаемый статус (проверьте, применена ли миграция enum)' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as {
      to_status?: string
      reason?: string | null
      effective_date?: string | null
    }

    const toStatus = body.to_status
    if (!toStatus || !(ALLOWED_TARGETS as readonly string[]).includes(toStatus)) {
      return NextResponse.json({ error: 'Недопустимый целевой статус' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: journey, error: fetchErr } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status, primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!journey) return NextResponse.json({ error: 'Journey не найден' }, { status: 404 })

    // Право на управление студентами в его подразделении
    await requireEducationPrivilege('manage_students', {
      department_id: (journey as { primary_department_id: string | null }).primary_department_id ?? undefined,
    })

    const needsDetails = (['on_leave', 'graduated', 'expelled'] as string[]).includes(toStatus as TargetStatus)
    const reason = body.reason?.trim() || null
    const effectiveDate = body.effective_date || null
    if (needsDetails) {
      if (!reason) return NextResponse.json({ error: 'Укажите причину' }, { status: 400 })
      if (!effectiveDate) return NextResponse.json({ error: 'Укажите дату' }, { status: 400 })
    }

    const { data: result, error: rpcErr } = await sb.rpc('transition_education_status', {
      p_journey_id: params.id,
      p_to_status: toStatus,
      p_actor_id: session.person_id,
      p_reason: reason,
      p_effective_date: effectiveDate,
    })

    if (rpcErr) {
      const m = mapPgError(rpcErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ ok: true, ...(result as Record<string, unknown> ?? {}) })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapPgError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
