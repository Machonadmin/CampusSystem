'use client'

import { usePathname } from 'next/navigation'
import { SidebarProvider, useSidebar } from '@/lib/sidebar/SidebarContext'
import { UiPrefsProvider } from '@/lib/prefs/UiPrefsContext'
import Header from './Header'
import Sidebar from './Sidebar'

interface Props {
  children: React.ReactNode
  userName: string | null
  roles: string[]
}

function ShellContent({ children, userName, roles }: Props) {
  const { isOpen, isMobile, close } = useSidebar()
  const mainStart = isMobile ? 0 : isOpen ? 240 : 56
  // Код модуля из URL (/dashboard/quality-control/... → quality_control,
  // /dashboard → dashboard). По нему globals.css красит основные кнопки в
  // мягкий оттенок модуля (data-module → --action*). Для страниц без своего
  // цвета (профиль, календарь…) правила нет — остаётся оттенок по умолчанию.
  const pathname = usePathname() ?? ''
  const segment = pathname.split('/')[2] ?? ''
  const moduleCode = segment ? segment.replace(/-/g, '_') : 'dashboard'

  return (
    <>
      <Header userName={userName} roles={roles} />
      <Sidebar />
      {/* Mobile overlay backdrop */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          style={{ top: 64 }}
          onClick={close}
        />
      )}
      <main
        data-module={moduleCode}
        style={{
          paddingTop: 64,
          paddingInlineStart: mainStart,
          transition: 'padding-inline-start 0.2s ease',
          minHeight: '100vh',
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          // Гарантия против горизонтального переполнения: любой слишком широкий
          // элемент внутри обрезается, а не «раздвигает» страницу (из-за чего
          // телефон отдалял всю раскладку и рейл наезжал на контент). clip (не
          // hidden) не создаёт скролл-контейнер и не ломает position: sticky.
          overflowX: 'clip',
          maxWidth: '100%',
        }}
      >
        {children}
      </main>
    </>
  )
}

export default function DashboardShell({ children, userName, roles }: Props) {
  return (
    <UiPrefsProvider>
      <SidebarProvider>
        <ShellContent userName={userName} roles={roles}>
          {children}
        </ShellContent>
      </SidebarProvider>
    </UiPrefsProvider>
  )
}
