import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageEducationInAny } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PUT    /api/education/no-lesson-days/templates/[id] — обновить шаблон (имя,
 *   is_active) и, если передан days[], полностью ЗАМЕНИТЬ набор дней.
 * DELETE — удалить шаблон (дни каскадно). Право: любое управляющее education-право.
 */

const dayShape = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  reason: z.string().trim().max(200).nullish(),
})
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
  days: z.array(dayShape).max(200).optional(),
})

async function gate() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('unauthorized'), { status: 401, apiCode: 'unauthorized' })
  if (!(await canManageEducationInAny(session, 'manage_class_groups'))) {
    throw Object.assign(new Error('forbidden'), { status: 403, apiCode: 'forbidden' })
  }
  return session
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, updateSchema)
    await gate()
    const sb = createServerClient()

    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.is_active !== undefined) patch.is_active = body.is_active
    if (Object.keys(patch).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.from('no_lesson_day_templates') as any).update(patch).eq('id', params.id).select('id').maybeSingle()
      if (error) throw error
      if (!data) return apiError('record_not_found', 404)
    }

    if (body.days !== undefined) {
      // Полная замена набора дней шаблона.
      const { error: delErr } = await sb.from('no_lesson_day_template_days').delete().eq('template_id', params.id)
      if (delErr) throw delErr
      if (body.days.length > 0) {
        const rows = body.days.map((d, i) => ({ template_id: params.id, month: d.month, day: d.day, reason: d.reason ?? null, sort_order: i }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (sb.from('no_lesson_day_template_days') as any).insert(rows)
        if (insErr) throw insErr
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await gate()
    const sb = createServerClient()
    const { error } = await sb.from('no_lesson_day_templates').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
