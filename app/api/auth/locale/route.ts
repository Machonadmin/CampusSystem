import { NextResponse } from 'next/server'

// Намеренно без проверки сессии: переключатель языка используется на странице
// логина (app/(auth)/layout.tsx), до аутентификации. Меняет только cookie
// UI-предпочтения, не данные.
export async function POST(req: Request) {
  const body = await req.json() as { locale?: unknown }
  const locale = body.locale
  if (locale !== 'ru' && locale !== 'he' && locale !== 'en') {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('campus_locale', locale, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    httpOnly: false,
    sameSite: 'lax',
  })
  return res
}
