import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import Header from '@/components/dashboard/Header'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <LanguageProvider>
      <Header userName={session.full_name} roles={session.roles} />
      <Sidebar />
      <main className="pt-16 ps-56 min-h-screen bg-gray-50">
        {children}
      </main>
    </LanguageProvider>
  )
}
