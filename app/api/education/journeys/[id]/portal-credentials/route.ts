import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { generatePassword, hashPassword } from '@/lib/auth/password'

// student_credentials ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — обращаемся к ней через нетипизированный клиент.
function creds(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('student_credentials')
}

/**
 * Учётные данные портала студентки — управление сотрудником.
 *
 *   GET  → существует ли вход + login_email (без хеша пароля).
 *   POST → создать/сбросить: генерирует пароль, хеширует, сохраняет и
 *          ВОЗВРАЩАЕТ открытый пароль ОДИН раз ({ email, password }).
 *
 * Доступ: только сотрудник (никогда не студентка) — superadmin ИЛИ
 * manage_students в подразделении journey. journey должна быть education_status='student'.
 * Открытый пароль нигде не хранится.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gateStaff(journeyId: string): Promise<{ err: NextResponse } | {
  sb: ReturnType<typeof createServerClient>
  journey: { id: string; person_id: string; primary_department_id: string | null; education_status: string | null }
}> {
  const session = await getSession()
  if (!session) return { err: apiError('unauthorized', 401) }
  // Студентка НИКОГДА не управляет учётными данными.
  if (session.principal === 'student') return { err: apiError('forbidden', 403) }

  const sb = createServerClient()
  const { data: journey } = await sb
    .from('education_journeys')
    .select('id, person_id, primary_department_id, education_status')
    .eq('id', journeyId)
    .maybeSingle()
  if (!journey) return { err: apiError('journey_not_found', 404) }

  const j = journey as { id: string; person_id: string; primary_department_id: string | null; education_status: string | null }
  // Вход в портал — только для студенток.
  if (j.education_status !== 'student') return { err: apiError('forbidden', 403) }

  const allowed = session.roles.includes('superadmin')
    || await hasEducationPrivilege(session, 'manage_students', {
      department_id: j.primary_department_id ?? undefined,
    })
  if (!allowed) return { err: apiError('forbidden', 403) }

  return { sb, journey: j }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await gateStaff(params.id)
    if ('err' in g) return g.err

    const { data, error } = await creds(g.sb)
      .select('login_email, is_active, last_login')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ exists: false })
      throw error
    }

    if (!data) return NextResponse.json({ exists: false })
    return NextResponse.json({
      exists: true,
      email: (data as { login_email: string }).login_email,
      is_active: (data as { is_active: boolean }).is_active,
      last_login: (data as { last_login: string | null }).last_login,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await gateStaff(params.id)
    if ('err' in g) return g.err
    const { sb, journey } = g

    const body = await request.json().catch(() => ({})) as { email?: string }
    let email = (body.email ?? '').toLowerCase().trim()

    // По умолчанию — email персоны.
    if (!email) {
      const { data: person } = await sb
        .from('persons')
        .select('email')
        .eq('id', journey.person_id)
        .maybeSingle()
      email = ((person as { email?: string | null } | null)?.email ?? '').toLowerCase().trim()
    }
    if (!email) return apiError('invalid_email', 400)

    // Генерация и хеш пароля (открытый текст не сохраняем — вернём один раз).
    const password = generatePassword()
    const password_hash = await hashPassword(password)

    // Upsert по journey_id: одна учётка на journey. Сброс = обновление строки.
    const { data: existing, error: selErr } = await creds(sb)
      .select('id')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (selErr) {
      if ((selErr as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw selErr
    }

    if (existing) {
      const { error: updErr } = await creds(sb)
        .update({ login_email: email, password_hash, is_active: true })
        .eq('journey_id', params.id)
      if (updErr) {
        if ((updErr as { code?: string }).code === '23505') return apiError('email_in_use', 409)
        throw updErr
      }
    } else {
      const { error: insErr } = await creds(sb)
        .insert({
          journey_id: params.id,
          person_id: journey.person_id,
          login_email: email,
          password_hash,
          is_active: true,
        })
      if (insErr) {
        if ((insErr as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
        if ((insErr as { code?: string }).code === '23505') return apiError('email_in_use', 409)
        throw insErr
      }
    }

    // Возвращаем открытый пароль ОДИН раз — сотрудник передаёт его студентке.
    return NextResponse.json({ email, password })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
