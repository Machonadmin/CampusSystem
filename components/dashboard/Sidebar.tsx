'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLang } from '@/lib/i18n/LanguageContext'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { getModuleColor, isModuleImplemented } from '@/lib/module-colors'

// ── Icon paths (Heroicons outline 24px) ────────────────────────────────────
const I = {
  home: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  tasks: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  education: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  finance: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  dormitory: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  food: 'M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 4.5h.008v.008H9v-.008zm3 0h.008v.008H12v-.008zm3 0h.008v.008H15v-.008zm-6 3h.008v.008H9v-.008zm3 0h.008v.008H12v-.008zm3 0h.008v.008H15v-.008zM5.25 19.5h13.5',
  maintenance: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
  security: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  alumni: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  sponsors: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  doctor: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  psychologist: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
  documents: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  reports: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  contacts: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  staff: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z',
  settings: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  quality_control: 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.723 3.065 3.745 3.745 0 01-3.065.723 3.745 3.745 0 01-3.068 1.593 3.745 3.745 0 01-3.068-1.593 3.746 3.746 0 01-3.065-.723 3.745 3.745 0 01-.723-3.065A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.723-3.065 3.746 3.746 0 013.065-.723A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.065.723 3.746 3.746 0 01.723 3.065A3.745 3.745 0 0121 12z',
}

const TOP_ITEMS = [
  { key: 'home' as const, href: '/dashboard', icon: I.home },
  { key: 'tasks' as const, href: '/dashboard/tasks', icon: I.tasks },
]

const MODULES = [
  { key: 'staff' as const, href: '/dashboard/staff', icon: I.staff },
  { key: 'quality_control' as const, href: '/dashboard/quality-control', icon: I.quality_control },
  { key: 'education' as const, href: '/dashboard/education', icon: I.education },
  { key: 'finance' as const, href: '/dashboard/finance', icon: I.finance },
  { key: 'dormitory' as const, href: '/dashboard/dormitory', icon: I.dormitory },
  { key: 'food' as const, href: '/dashboard/food', icon: I.food },
  { key: 'maintenance' as const, href: '/dashboard/maintenance', icon: I.maintenance },
  { key: 'security' as const, href: '/dashboard/security', icon: I.security },
  { key: 'alumni' as const, href: '/dashboard/alumni', icon: I.alumni },
  { key: 'sponsors' as const, href: '/dashboard/sponsors', icon: I.sponsors },
  { key: 'doctor' as const, href: '/dashboard/doctor', icon: I.doctor },
  { key: 'psychologist' as const, href: '/dashboard/psychologist', icon: I.psychologist },
  { key: 'documents' as const, href: '/dashboard/documents', icon: I.documents },
  { key: 'reports' as const, href: '/dashboard/reports', icon: I.reports },
  { key: 'contacts' as const, href: '/dashboard/contacts', icon: I.contacts },
  { key: 'settings' as const, href: '/dashboard/settings', icon: I.settings },
]

// ── Nav link — defined outside Sidebar to avoid reconciliation issues ────────
function SidebarNavLink({
  href, iconPath, label, active, isOpen, isRTL, moduleKey,
}: {
  href: string
  iconPath: string
  label: string
  active: boolean
  isOpen: boolean
  isRTL: boolean
  moduleKey: string
}) {
  const colorKey = moduleKey === 'home' ? 'dashboard' : moduleKey
  const implemented = moduleKey === 'home' || isModuleImplemented(moduleKey)
  const activePrimary = getModuleColor(colorKey, 'primary')
  const activeLight = getModuleColor(colorKey, 'light')
  return (
    <div className="relative">
      {active && (
        <span
          className="absolute top-0 bottom-0 w-[3px] rounded-r"
          style={{ [isRTL ? 'right' : 'left']: 0, backgroundColor: activePrimary }}
        />
      )}
      <Link
        href={implemented ? href : '#'}
        title={!isOpen ? label : undefined}
        onClick={implemented ? undefined : (e) => e.preventDefault()}
        prefetch={false}
        className={`flex items-center transition-colors mx-2 rounded-lg ${isOpen ? 'gap-3' : 'justify-center'}`}
        style={
          active
            ? { backgroundColor: activeLight, color: activePrimary, padding: isOpen ? '8px 10px' : '10px 11px' }
            : {
                color: implemented ? '#4B5563' : '#C4C9D0',
                cursor: implemented ? 'pointer' : 'not-allowed',
                padding: isOpen ? '8px 10px' : '10px 11px',
              }
        }
      >
        <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={iconPath} />
        </svg>
        <span
          style={{
            maxWidth: isOpen ? 180 : 0,
            opacity: isOpen ? 1 : 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            transition: 'max-width 0.2s ease, opacity 0.15s ease',
            fontSize: 14,
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {label}
        </span>
        {isOpen && !implemented && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#F59E0B',
            letterSpacing: '0.05em', flexShrink: 0,
          }}>
            СКОРО
          </span>
        )}
      </Link>
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { t, isRTL } = useLang()
  const { isOpen, isPinned, isMobile, toggle, close, setPin } = useSidebar()
  const sidebarRef = useRef<HTMLElement>(null)
  const [accessibleModules, setAccessibleModules] = useState<string[] | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.accessible_modules) setAccessibleModules(data.accessible_modules) })
  }, [])

  // Click-outside to close when unpinned on desktop
  useEffect(() => {
    if (isPinned || isMobile || !isOpen) return
    function onOutside(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [isPinned, isMobile, isOpen, close])

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside
      ref={sidebarRef}
      className="fixed top-16 bottom-0 z-40 flex flex-col bg-white overflow-hidden"
      style={{
        width: isOpen ? 240 : 56,
        transition: 'width 0.2s ease, transform 0.2s ease',
        [isRTL ? 'right' : 'left']: 0,
        transform: isMobile && !isOpen ? `translateX(${isRTL ? '100%' : '-100%'})` : 'translateX(0)',
        borderInlineEnd: '1px solid #E5E7EB',
      }}
    >
      {/* ── Sidebar header: logo + pin + toggle ── */}
      <div
        className="flex items-center border-b border-gray-100 flex-shrink-0"
        style={{
          justifyContent: isOpen ? 'space-between' : 'center',
          padding: isOpen ? '8px 12px' : '10px 0',
          minHeight: 52,
        }}
      >
        {isOpen && (
          <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" style={{ height: 26, objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.campusNameShort}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Pin button — desktop only, visible when expanded */}
          {isOpen && !isMobile && (
            <button
              onClick={() => setPin(!isPinned)}
              title={isPinned ? 'Открепить' : 'Закрепить'}
              className={`p-1.5 rounded transition-colors ${
                isPinned ? 'text-[#3B82F6] bg-[#EEF2FF]' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg style={{ width: 13, height: 13 }} fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}

          {/* Toggle button */}
          <button
            onClick={toggle}
            title={isOpen ? 'Свернуть' : 'Развернуть'}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {isOpen ? (
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={isRTL ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
              </svg>
            ) : (
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {TOP_ITEMS.map(item => (
          <SidebarNavLink
            key={item.key}
            href={item.href}
            iconPath={item.icon}
            label={t.nav[item.key]}
            active={isActive(item.href)}
            isOpen={isOpen}
            isRTL={isRTL}
            moduleKey={item.key}
          />
        ))}

        {/* Section divider / header */}
        <div style={{ padding: isOpen ? '16px 16px 4px' : '12px 6px 4px' }}>
          {isOpen ? (
            <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {t.nav.modulesSection}
            </p>
          ) : (
            <div style={{ height: 1, backgroundColor: '#F3F4F6' }} />
          )}
        </div>

        {(accessibleModules === null ? MODULES : MODULES.filter(m => accessibleModules.includes(m.key))).map(item => (
          <SidebarNavLink
            key={item.key}
            href={item.href}
            iconPath={item.icon}
            label={t.nav[item.key]}
            active={isActive(item.href)}
            isOpen={isOpen}
            isRTL={isRTL}
            moduleKey={item.key}
          />
        ))}
      </nav>

      {/* Footer */}
      {isOpen && (
        <div className="border-t border-gray-100 flex-shrink-0 px-3 py-3">
          <p className="text-[10px] text-gray-400 text-center">© 2025 {t.campusNameShort}</p>
        </div>
      )}
    </aside>
  )
}
