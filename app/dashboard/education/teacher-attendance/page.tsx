import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import TeacherAttendanceClient from './TeacherAttendanceClient'

/**
 * «נוכחות מורים» — учитель отмечает присутствие на своих уроках, секретариат
 * (manage_students / superadmin) подтверждает. Страница доступна любому
 * сотруднику: teacher видит self-report, секретариат — очередь на подтверждение.
 */
export default async function TeacherAttendancePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.principal === 'student') redirect('/dashboard')
  const canApprove = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
  return <TeacherAttendanceClient canApprove={canApprove} />
}
