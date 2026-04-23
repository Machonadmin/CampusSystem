import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  return NextResponse.json({
    person_id: session.person_id,
    login_email: session.login_email,
    roles: session.roles,
  })
}
