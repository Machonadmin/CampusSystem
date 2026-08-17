import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hashPassword, generatePassword } from '@/lib/auth/password'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

async function handlePasswordReset(request: NextRequest, params: { id: string }) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as { password?: string; generate_password?: boolean }

    const wasGenerated = body.generate_password || !body.password
    const password = wasGenerated ? generatePassword() : body.password!
    if (password.length < 8)
      return apiError('password_min_8', 400)

    const password_hash = await hashPassword(password)
    const { error } = await sb.from('person_accounts')
      .update({ password_hash })
      .eq('id', params.id)
    if (error) throw error

    // Сгенерированный (временный) пароль → пользователь обязан сменить его при
    // первом входе. Best-effort: до миграции колонки может не быть (42703).
    if (wasGenerated) {
      try {
        await (sb as unknown as import('@supabase/supabase-js').SupabaseClient)
          .from('person_accounts').update({ must_change_password: true }).eq('id', params.id)
      } catch { /* колонки нет до миграции — игнорируем */ }
    }

    return NextResponse.json({ ok: true, generated_password: wasGenerated ? password : undefined })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  return handlePasswordReset(request, params)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return handlePasswordReset(request, params)
}
