'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import ChangePasswordModal from '@/components/ChangePasswordModal'
import NotificationBell from '@/components/dashboard/NotificationBell'
import GlobalSearch from '@/components/dashboard/GlobalSearch'
import { useSidebar } from '@/lib/sidebar/SidebarContext'

interface HeaderProps {
  userName: string | null
  roles: string[]
}

export default function Header({ userName, roles }: HeaderProps) {
  const { lang, setLang, t, isRTL } = useLang()
  const tNav = useTranslations('navigation')
  const { toggle: toggleSidebar } = useSidebar()
  const router = useRouter()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  async function handleLogout() {
    setUserMenuOpen(false)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const primaryRole = roles[0] ?? ''
  const roleName = t.roles[primaryRole as keyof typeof t.roles] ?? primaryRole
  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <>
    <header
      className="fixed top-0 inset-x-0 z-50 h-16 flex items-center gap-4 px-4"
      style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}
    >
      {/* ── Hamburger (mobile only) — открывает off-canvas sidebar ── */}
      <button
        onClick={toggleSidebar}
        aria-label={tNav('toggle_menu')}
        className="md:hidden flex items-center justify-center rounded-lg hover:bg-gray-100 transition flex-shrink-0"
        style={{ width: 40, height: 40 }}
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Logo + Campus name ── */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{ borderInlineStart: '3px solid #4BAED4', paddingInlineStart: 12 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt={tNav('logo_alt')} style={{ height: 40, objectFit: 'contain', flexShrink: 0 }} />
        <span
          className="hidden lg:block"
          style={{ color: '#3B82F6', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {t.campusName}
        </span>
        <span
          className="block lg:hidden"
          style={{ color: '#3B82F6', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {t.campusNameShort}
        </span>
      </div>

      {/* ── Search ── */}
      <GlobalSearch searchHint={t.searchHint} />

      {/* ── Right actions ── */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Notification bell */}
        <NotificationBell />

        {/* Language switcher */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['ru', 'he', 'en'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => { setLang(l); router.refresh() }}
              className={`w-8 py-1 rounded text-xs font-semibold transition ${
                lang === l ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
              style={lang === l ? { backgroundColor: '#3B82F6' } : {}}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            <div className="hidden sm:block text-start" style={{ minWidth: 140 }}>
              <p className="text-[13px] font-medium text-gray-900 truncate leading-tight" style={{ maxWidth: 160 }}>
                {userName ?? '—'}
              </p>
              <p className="text-[11px] text-gray-400 truncate leading-tight" style={{ maxWidth: 160 }}>
                {roleName}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: '#3B82F6' }}
            >
              {initials}
            </div>
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50`}>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{roleName}</p>
              </div>

              <button
                onClick={() => setUserMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {t.user.profile}
              </button>

              <button
                onClick={() => { setUserMenuOpen(false); setPwdOpen(true) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                {t.user.changePassword}
              </button>

              <div className="border-t border-gray-100 my-1" />

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {t.user.logout}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>

    {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
    </>
  )
}
