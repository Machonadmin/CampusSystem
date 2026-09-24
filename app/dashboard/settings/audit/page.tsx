import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AuditLogClient from './AuditLogClient'

/**
 * Журнал изменений (`audit_log`) — ТОЛЬКО ЧТЕНИЕ. Триггеры БД пишут каждое
 * изменение 8 чувствительных таблиц, но до сих пор это никто не показывал
 * (аудит §17.6). Право: superadmin, как остальные экраны настроек прав.
 */
export default async function AuditLogPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!session.roles.includes('superadmin')) redirect('/dashboard')

  return <AuditLogClient />
}
