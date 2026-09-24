import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth/session'

/** Выход студентки из портала: удаляет сессионную куку. */
export async function POST() {
  await clearSession()
  return NextResponse.json({ ok: true })
}
