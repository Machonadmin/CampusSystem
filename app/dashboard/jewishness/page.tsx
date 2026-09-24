import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasJewishnessAccess } from '@/lib/jewishness/permissions'
import JewishnessListClient from './JewishnessListClient'

/**
 * Бирур яхадут (Jewishness verification): список проверок + модалка с
 * документами и решением. Доступ гейтится привилегией jewishness.access
 * (страница также защищена middleware — PROTECTED_MODULES содержит 'jewishness').
 */
export default async function JewishnessPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasJewishnessAccess(session)
  if (!canView) redirect('/dashboard')

  return <JewishnessListClient />
}
