'use client'

import { SidebarProvider, useSidebar } from '@/lib/sidebar/SidebarContext'
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
        style={{
          paddingTop: 64,
          paddingInlineStart: mainStart,
          transition: 'padding-inline-start 0.2s ease',
          minHeight: '100vh',
          backgroundColor: '#F9FAFB',
        }}
      >
        {children}
      </main>
    </>
  )
}

export default function DashboardShell({ children, userName, roles }: Props) {
  return (
    <SidebarProvider>
      <ShellContent userName={userName} roles={roles}>
        {children}
      </ShellContent>
    </SidebarProvider>
  )
}
