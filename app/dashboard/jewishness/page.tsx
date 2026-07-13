import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasJewishnessAccess } from '@/lib/jewishness/permissions'
import JewishnessListClient from './JewishnessListClient'

/**
 * Бирур яхадут (Jewishness verification) — плейсхолдер списка проверок. Доступ
 * гейтится привилегией jewishness.access (страница также защищена middleware —
 * PROTECTED_MODULES содержит 'jewishness'). Реальные записи проверки и загрузка
 * документов появятся в следующих шагах.
 */
export default async function JewishnessPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasJewishnessAccess(session)
  if (!canView) redirect('/dashboard')

  return <JewishnessListClient />
}
