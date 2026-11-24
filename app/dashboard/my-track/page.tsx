import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import MyTrackClient from './MyTrackClient'

/**
 * «המסלול שלי»: ответственный маршрута сам выбирает студенток. Только
 * auth-gate (как פאנל ניהול) — какие маршруты доступны, решает
 * /api/education/my-track (ответственный, manage_tracks или superadmin).
 */
export default async function MyTrackPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <MyTrackClient />
}
