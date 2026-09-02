import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageEducationInAny } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Шаблоны дней без уроков (no_lesson_day_templates, spec §3.4). Редактируемый
 * набор дней (напр. праздники), который можно ПРЕДЛОЖИТЬ при открытии года —
 * никогда не мандаторно. Право: любое управляющее education-право.
 *
 * GET  /api/education/no-lesson-days/templates — список шаблонов с днями.
 * POST — создать шаблон { name, days:[{month,day,reason?}] }.
 */

const dayShape = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  reason: z.string().trim().max(200).nullish(),
})
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  days: z.array(dayShape).max(200).optional(),
})

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageEducationInAny(session, 'manage_class_groups'))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data: tpls, error } = await sb
      .from('no_lesson_day_templates')
      .select('id, name, is_active')
      .order('name', { ascending: true })
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ templates: [] })
      throw error
    }
    const templates = (tpls ?? []) as Array<{ id: string; name: string; is_active: boolean }>
    let daysByTpl = new Map<string, Array<{ id: string; month: number; day: number; reason: string | null }>>()
    if (templates.length > 0) {
      const { data: days, error: dErr } = await sb
        .from('no_lesson_day_template_days')
        .select('id, template_id, month, day, reason')
        .in('template_id', templates.map(t => t.id))
        .order('month', { ascending: true }).order('day', { ascending: true })
      if (dErr && dErr.code !== '42P01') throw dErr
      daysByTpl = new Map()
      for (const d of (days ?? []) as Array<{ id: string; template_id: string; month: number; day: number; reason: string | null }>) {
        const arr = daysByTpl.get(d.template_id) ?? []
        arr.push({ id: d.id, month: d.month, day: d.day, reason: d.reason })
        daysByTpl.set(d.template_id, arr)
      }
    }
    return NextResponse.json({ templates: templates.map(t => ({ ...t, days: daysByTpl.get(t.id) ?? [] })) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageEducationInAny(session, 'manage_class_groups'))) return apiError('forbidden', 403)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tpl, error } = await (sb.from('no_lesson_day_templates') as any)
      .insert({ name: body.name, created_by: session.person_id })
      .select('id')
      .single()
    if (error) throw error

    if (body.days && body.days.length > 0) {
      const rows = body.days.map((d, i) => ({ template_id: tpl.id, month: d.month, day: d.day, reason: d.reason ?? null, sort_order: i }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dErr } = await (sb.from('no_lesson_day_template_days') as any).insert(rows)
      if (dErr) throw dErr
    }
    return NextResponse.json({ id: tpl.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
