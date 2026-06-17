'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLang } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import ChangePasswordModal from '@/components/ChangePasswordModal'

interface HeaderProps {
  userName: string | null
  roles: string[]
}

export default function Header({ userName, roles }: HeaderProps) {
  const { lang, setLang, t, isRTL } = useLang()
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
      {/* ── Logo + Campus name ── */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{ borderLeft: '3px solid #4BAED4', paddingLeft: 12 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Махон Хамеш" style={{ height: 40, objectFit: 'contain', flexShrink: 0 }} />
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
      <div className="flex-1 max-w-xs mx-auto">
        <div className="relative">
          <svg
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            style={{ [isRTL ? 'right' : 'left']: '12px' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input
            id="global-search"
            type="text"
            placeholder={t.search}
            className="w-full bg-gray-100 text-gray-800 placeholder-gray-400 border border-gray-200 rounded-lg py-2 text-sm focus:outline-none focus:bg-white focus:border-[#4BAED4] transition"
            style={{ paddingLeft: isRTL ? '48px' : '36px', paddingRight: isRTL ? '36px' : '52px' }}
          />
          <kbd
            className="absolute top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded font-mono hidden sm:block"
            style={{ [isRTL ? 'left' : 'right']: '10px' }}
          >
            {t.searchHint}
          </kbd>
        </div>
      </div>

      {/* ── Right actions ── */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-400 rounded-full ring-2 ring-white" />
        </button>

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
            <div className="hidden sm:block text-left" style={{ minWidth: 140 }}>
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
