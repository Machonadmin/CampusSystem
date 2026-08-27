import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { generateLessonsForGroup, clampHorizonToPeriod } from '@/lib/education/lesson-generation'

/**
 * POST /api/education/schedule/slots/[slotId]/decision
 * Утверждение/отклонение слота, запрошенного на зарезервированное время кодеш.
 * Право: ТОЛЬКО מנהל כללי (роль superadmin) — решение владельца.
 * Body: { decision: 'approve' | 'reject' }.
 *   approve → approval_status='active' (слот вступает в силу, generate его берёт)
 *   reject  → approval_status='rejected'
 * Действует только на слоты в статусе 'pending'.
 * Деплой-безопасно: если колонок ещё нет (42703) — понятная ошибка 400.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { slotId: string } },
) {
  try {
    const session = await requireAuth()
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { decision?: string }
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      return apiError('invalid_decision', 400)
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('class_schedule_slots')
      .update({
        approval_status: body.decision === 'approve' ? 'active' : 'rejected',
        approved_by: session.person_id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', params.slotId)
      .eq('approval_status', 'pending')
      .select('id, approval_status, class_group_id')
      .maybeSingle()

    if (error) {
      if ((error as { code?: string }).code === '42703') {
        return apiError('approval_migration_missing', 400)
      }
      throw error
    }
    if (!data) return apiError('slot_not_found_or_decided', 404)

    // Утверждённый слот сразу материализуется в уроки на ближайший горизонт
    // (раньше аישור был тупиком: кто-то должен был вспомнить нажать «порождение»).
    // Best-effort: сбой генерации не отменяет само решение (cron доber завтра).
    let lessonsCreated = 0
    if (body.decision === 'approve') {
      try {
        const groupId = (data as { class_group_id: string }).class_group_id
        const { data: group } = await sb
          .from('class_groups')
          .select('period_start, period_end')
          .eq('id', groupId)
          .maybeSingle()
        const horizon = clampHorizonToPeriod(
          new Date().toISOString().slice(0, 10), 14,
          group?.period_start ?? null, group?.period_end ?? null,
        )
        if (horizon) {
          const res = await generateLessonsForGroup(
            sb, groupId, horizon.fromMs, horizon.toMs, session.person_id,
            { onlySlotIds: [params.slotId] },
          )
          lessonsCreated = res.created
        }
      } catch {
        // молча — уроки догенерирует ежедневный cron
      }
    }

    return NextResponse.json({ ok: true, approval_status: (data as { approval_status: string }).approval_status, lessons_created: lessonsCreated })
  } catch (err) {
    return jsonError(err)
  }
}
