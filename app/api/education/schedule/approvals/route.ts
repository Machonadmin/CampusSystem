import { NextResponse } from 'next/server'
import { requireAuth, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/education/schedule/approvals
 * Список слотов, ожидающих утверждения (кодеш-время, запрошенное менеджером
 * לימודי חול). Право: ТОЛЬКО מנהל כללי (роль superadmin).
 * Деплой-безопасно: пока миграция не применена (нет колонки approval_status,
 * ошибка 42703) — возвращаем пустой список.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('class_schedule_slots')
      .select('id, class_group_id, day_of_week, start_time, end_time, room, requested_by, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      if ((error as { code?: string }).code === '42703') return NextResponse.json({ requests: [] })
      throw error
    }

    const rows = (data ?? []) as Array<{
      id: string; class_group_id: string; day_of_week: number
      start_time: string; end_time: string; room: string | null; requested_by: string | null
    }>

    const groupIds = [...new Set(rows.map(r => r.class_group_id))]
    const personIds = [...new Set(rows.map(r => r.requested_by).filter((x): x is string => !!x))]

    const groupNames = new Map<string, string>()
    if (groupIds.length) {
      const { data: g } = await sb.from('class_groups').select('id, name').in('id', groupIds)
      for (const x of (g ?? []) as Array<{ id: string; name: string }>) groupNames.set(x.id, x.name)
    }
    const personNames = new Map<string, string>()
    if (personIds.length) {
      const { data: p } = await sb.from('persons').select('id, full_name').in('id', personIds)
      for (const x of (p ?? []) as Array<{ id: string; full_name: string }>) personNames.set(x.id, x.full_name)
    }

    const requests = rows.map(r => ({
      id: r.id,
      class_group_id: r.class_group_id,
      class_group_name: groupNames.get(r.class_group_id) ?? '',
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
      room: r.room,
      requested_by_name: r.requested_by ? (personNames.get(r.requested_by) ?? '') : '',
    }))

    return NextResponse.json({ requests })
  } catch (err) {
    return jsonError(err)
  }
}
