import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { parseBody, jsonError } from '@/lib/api/handler'
import { serverT } from '@/lib/i18n/api-errors'
import { rateLimit, clientIp } from '@/lib/public/rate-limit'

/** Служебный «актёр» публичной формы (см. 20260703150000_*.sql). */
const SYSTEM_PERSON_ID = 'ffffffff-0000-4000-8000-000000000001'

/**
 * POST /api/public/applications — ПУБЛИЧНЫЙ (без сессии; см. middleware).
 *
 * Приём заявки абитуриента с публичной формы сайта. Защита от спама двумя
 * слоями без внешних зависимостей: (1) honeypot-поле `website` — скрыто в
 * форме, боты его заполняют; (2) rate limit по IP. Затем RPC
 * create_application (всегда НОВАЯ запись — person_id не передаём). Актёр —
 * служебная запись SYSTEM_PERSON_ID (у публичной формы нет пользователя; у
 * записи есть активный, но невходной person_account — см. 20260703160000).
 *
 * Процесс «Набор» здесь НЕ запускается автоматически (решение с пользователем):
 * задача «связаться с лидом» из процесса назначается на creator'а, а им был бы
 * бот — бесполезно. Вместо этого создаётся задача-уведомление отделу
 * «Администрация»; сотрудник рассматривает заявку и запускает процесс сам
 * (уже под своим аккаунтом). Это также фильтр для спама, проскочившего honeypot.
 */
const publicApplicationSchema = z.object({
  first_name: z.string().trim().min(1, 'Имя обязательно').max(100),
  last_name: z.string().trim().max(100).optional(),
  phone: z.string().trim().min(3, 'Телефон обязателен').max(40),
  email: z.string().trim().email('Некорректный email').max(200).optional().or(z.literal('')),
  birth_date: z.string().trim().max(20).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  direction_id: z.string().uuid().optional().or(z.literal('')),
  // honeypot: реальные пользователи оставляют пустым
  website: z.string().max(0).optional().or(z.literal('')),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit по IP: не более 5 заявок за 10 минут с одного адреса
    const ip = clientIp(request.headers)
    const rl = rateLimit(`public-application:${ip}`, 5, 10 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: serverT('rate_limited_applications') },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await parseBody(request, publicApplicationSchema)

    // 2. Honeypot: если заполнено — молча делаем вид, что приняли (не палим бота)
    if (body.website && body.website.length > 0) {
      return NextResponse.json({ success: true }, { status: 201 })
    }

    const sb = createServerClient()

    // 3. Создание заявки — атомарно, всегда новая запись (person_id не передаём)
    const { data: rpcResult, error: rpcErr } = await sb.rpc('create_application', {
      payload: {
        first_name: body.first_name,
        last_name: body.last_name?.trim() || null,
        phone: body.phone,
        email: body.email?.trim() || null,
        birth_date: body.birth_date?.trim() || null,
        address: body.city?.trim() ? { city: body.city.trim() } : null,
        interests: body.direction_id ? [{ direction_id: body.direction_id }] : [],
        referral_source: 'public_form',
        actor_id: SYSTEM_PERSON_ID,
      },
    })
    if (rpcErr) throw rpcErr
    const { journey_id: journeyId } = rpcResult as { person_id: string; journey_id: string }

    // 4. Уведомление персоналу — задача отделу «Администрация».
    //    Ищем отдел по имени; если нет — задача уходит в общий пул
    //    (unassigned), чтобы уведомление не потерялось. Best-effort.
    try {
      const { data: dept } = await sb
        .from('departments')
        .select('id')
        .eq('name', 'Администрация')
        .maybeSingle()

      const applicantName = [body.last_name?.trim(), body.first_name.trim()].filter(Boolean).join(' ')
      const base = {
        title: `Новая заявка с сайта: ${applicantName}`,
        description: `Телефон: ${body.phone}${body.email ? `\nEmail: ${body.email}` : ''}`,
        module: 'education' as const,
        metadata: { source: 'public_form', journey_id: journeyId },
        creator_id: SYSTEM_PERSON_ID,
        priority: 'normal' as const,
        due_all_day: true,
      }
      const insert = dept?.id
        ? { ...base, assignee_type: 'department' as const, department_id: dept.id, status: 'unassigned' as const }
        : { ...base, assignee_type: 'unassigned' as const, status: 'unassigned' as const }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('tasks').insert(insert as any)
    } catch (notifyErr) {
      console.error('[public/applications] staff notification:', notifyErr)
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
