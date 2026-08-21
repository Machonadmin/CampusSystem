import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { getCookieLocale } from '@/lib/i18n/locale'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { Toaster } from '@/components/ui/toast'
import { ConfirmRoot } from '@/components/ui/ConfirmDialog'
import TopProgressBar from '@/components/ui/TopProgressBar'
import ForcePasswordChangeGate from '@/components/auth/ForcePasswordChangeGate'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const locale = getCookieLocale()

  return (
    <LanguageProvider initialLocale={locale}>
      <Suspense fallback={null}><TopProgressBar /></Suspense>
      <DashboardShell userName={session.full_name} roles={session.roles}>
        {children}
      </DashboardShell>
      <ForcePasswordChangeGate />
      <Toaster />
      <ConfirmRoot />
    </LanguageProvider>
  )
}
