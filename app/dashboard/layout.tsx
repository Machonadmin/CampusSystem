import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { getCookieLocale } from '@/lib/i18n/locale'
import DashboardShell from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const locale = getCookieLocale()

  return (
    <LanguageProvider initialLocale={locale}>
      <DashboardShell userName={session.full_name} roles={session.roles}>
        {children}
      </DashboardShell>
    </LanguageProvider>
  )
}
