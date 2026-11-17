import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import MeetingsClient from './MeetingsClient'

/**
 * פגישות: יומן המנהל, בקשות לפגישה, מעקב משימות, מה הועבר אליי.
 * Только auth-gate (как календарь): что кому видно, считают /api/meetings/**.
 */
export default async function MeetingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <Suspense>
      <MeetingsClient />
    </Suspense>
  )
}
