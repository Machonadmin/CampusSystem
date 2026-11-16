import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import MeetingDetailClient from './MeetingDetailClient'

/** Встреча: что кому видно, решает /api/meetings/[id]. */
export default async function MeetingPage(props: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { id } = await props.params
  return <MeetingDetailClient id={id} />
}
