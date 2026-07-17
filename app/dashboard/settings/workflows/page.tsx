import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import WorkflowsClient from './WorkflowsClient'

export default async function WorkflowsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <WorkflowsClient canEdit={session.roles.includes('superadmin')} />
}
