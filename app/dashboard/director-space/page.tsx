import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import DirectorClient from './DirectorClient'

/**
 * «מרחב המנהל»: всё, что ждёт утверждения, в одном месте. Только auth-gate
 * (как פאנל ניהול / פגישות) — кого пускать, решает /api/director/inbox:
 * המנהל (superadmin) и מזכירת המנהל; остальным экран пишет «нет доступа».
 */
export default async function DirectorPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <DirectorClient />
}
