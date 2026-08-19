import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'

// student_credentials ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — читаем/пишем её через нетипизированный клиент.
function creds(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('student_credentials')
}

/**
 * Вход студентки в личный портал (/portal).
 *
 * БЕЗОПАСНОСТЬ: читает ТОЛЬКО student_credentials (не person_accounts) — поэтому
 * этот маршрут не может залогинить сотрудника, а /api/auth/login не может
 * залогинить студентку. Токен студентки получает principal:'student',
 * student_journey_id и roles:[] (никогда никаких ролей сотрудника).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return apiError('email_password_required', 400)
    }

    const supabase = createServerClient()
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Учётные данные студентки по email.
    const { data: cred, error: credError } = await creds(supabase)
      .select('journey_id, person_id, login_email, password_hash, is_active')
      .eq('login_email', normalizedEmail)
      .maybeSingle()

    if (credError || !cred) {
      return apiError('invalid_credentials', 401)
    }
    if (!cred.is_active || !cred.password_hash) {
      return apiError('invalid_credentials', 401)
    }

    // 2. Journey всё ещё существует и является студенткой.
    const { data: journey } = await supabase
      .from('education_journeys')
      .select('id, education_status')
      .eq('id', cred.journey_id)
      .maybeSingle()

    if (!journey || journey.education_status !== 'student') {
      return apiError('invalid_credentials', 401)
    }

    // 3. Проверка пароля.
    const passwordValid = await verifyPassword(password, cred.password_hash)
    if (!passwordValid) {
      return apiError('invalid_credentials', 401)
    }

    // 4. Имя персоны для приветствия.
    const { data: person } = await supabase
      .from('persons')
      .select('full_name')
      .eq('id', cred.person_id)
      .maybeSingle()

    await createSession({
      person_id: cred.person_id,
      login_email: cred.login_email,
      full_name: person?.full_name ?? null,
      roles: [],
      principal: 'student',
      student_journey_id: cred.journey_id,
    })

    // Отметка времени входа (best-effort; ошибку игнорируем).
    try {
      await creds(supabase)
        .update({ last_login: new Date().toISOString() })
        .eq('journey_id', cred.journey_id)
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[portal/login] unhandled exception:', err)
    return apiError('internal_error', 500)
  }
}
