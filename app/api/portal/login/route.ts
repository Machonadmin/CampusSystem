import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { verifyLoginPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { throttleAuth, tooManyAttempts } from '@/lib/auth/login-throttle'
import {
  selectLoginRow, lockedForSec, recordFailedLogin, recordSuccessfulLogin,
  unknownLockedForSec, recordUnknownFailure,
} from '@/lib/auth/account-lockout'

// student_credentials ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — читаем/пишем её через нетипизированный клиент.
function creds(sb: ReturnType<typeof createServerClient>) {
  return sb.from('student_credentials')
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
    const throttled = throttleAuth(request, 'portal-login')
    if (throttled) return throttled

    const body = await request.json().catch(() => ({}))
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return apiError('email_password_required', 400)
    }

    const supabase = createServerClient()
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Учётные данные студентки по email (с полями блокировки, если миграция применена).
    const { row: found } = await selectLoginRow<{
      journey_id: string; person_id: string; login_email: string; password_hash: string | null; is_active: boolean
    }>('student_credentials', 'journey_id, person_id, login_email, password_hash, is_active', normalizedEmail)

    // Пароль сверяем первым и одинаково по времени для любого адреса
    // (verifyLoginPassword): иначе несуществующий адрес отвечал бы быстрее, и по
    // скорости ответа можно было бы узнать, какие адреса в системе есть.
    const passwordValid = await verifyLoginPassword(password, found?.password_hash)

    // После 10 неудач подряд вход закрыт на 15 минут (lib/auth/account-lockout.ts).
    const lockedSec = found ? lockedForSec(found) : unknownLockedForSec(`student:${normalizedEmail}`)
    if (lockedSec > 0) return tooManyAttempts(lockedSec)

    if (!found || !passwordValid) {
      if (found) await recordFailedLogin('student_credentials', normalizedEmail, found)
      else recordUnknownFailure(`student:${normalizedEmail}`)
      return apiError('invalid_credentials', 401)
    }
    if (!found.is_active) return apiError('invalid_credentials', 401)

    await recordSuccessfulLogin('student_credentials', normalizedEmail, found)

    // 2. Journey всё ещё существует и является студенткой.
    const { data: journey } = await supabase
      .from('education_journeys')
      .select('id, education_status')
      .eq('id', found.journey_id)
      .maybeSingle()

    if (!journey || journey.education_status !== 'student') {
      return apiError('invalid_credentials', 401)
    }

    // 4. Имя персоны для приветствия.
    const { data: person } = await supabase
      .from('persons')
      .select('full_name')
      .eq('id', found.person_id)
      .maybeSingle()

    await createSession({
      person_id: found.person_id,
      login_email: found.login_email,
      full_name: person?.full_name ?? null,
      roles: [],
      principal: 'student',
      student_journey_id: found.journey_id,
    })

    // Отметка времени входа (best-effort; ошибку игнорируем).
    try {
      await creds(supabase)
        .update({ last_login: new Date().toISOString() })
        .eq('journey_id', found.journey_id)
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[portal/login] unhandled exception:', err)
    return apiError('internal_error', 500)
  }
}
