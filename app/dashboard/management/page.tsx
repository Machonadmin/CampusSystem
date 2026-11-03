import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import ManagementClient from './ManagementClient'

/**
 * פאנל ניהול: סיכומי אסיפות + מטרות с אבני דרך. Только auth-gate (как календарь):
 * каждый видит то, где он создатель, участник или ответственный; доступ
 * считают маршруты /api/management/**.
 */
export default async function ManagementPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <Suspense>
      <ManagementClient />
    </Suspense>
  )
}
