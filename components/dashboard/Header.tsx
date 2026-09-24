'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import ChangePasswordModal from '@/components/ChangePasswordModal'
import NotificationBell from '@/components/dashboard/NotificationBell'
import GlobalSearch from '@/components/dashboard/GlobalSearch'
import ThemeToggle from '@/components/dashboard/ThemeToggle'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { useMe } from '@/lib/hooks/useMe'

interface HeaderProps {
  userName: string | null
  roles: string[]
}

export default function Header({ userName, roles }: HeaderProps) {
  const { lang, setLang, t, isRTL } = useLang()
  const tNav = useTranslations('navigation')
  const tSearch = useTranslations('search')
  const { toggle: toggleSidebar } = useSidebar()
  const router = useRouter()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  // Мобильная панель поиска людей (на телефоне поле поиска в шапке скрыто).
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
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

  const me = useMe()
  const primaryRole = roles[0] ?? ''
  const roleName = t.roles[primaryRole as keyof typeof t.roles] ?? primaryRole
  // Подпись под именем: конкретная должность-ярлык (напр. «מזכירת טורו»),
  // с падением на имя роли, если должность не задана.
  const subtitle = me?.position_title || roleName
  // Имя в меню пользователя ведёт в СВОЮ карточку человека. Карточка
  // (/dashboard/persons/[id] и её API) требует persons.view — отдельного права
  // «смотреть себя» нет. Поэтому ссылка только тем, у кого модуль «אנשים»
  // доступен; остальным имя просто текст (а не переход на «нет доступа»).
  const ownCardHref = me?.person_id && me.accessible_modules?.includes('persons')
    ? `/dashboard/persons/${me.person_id}`
    : null
  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <>
    <header
      className="fixed top-0 inset-x-0 z-50 h-16 flex items-center gap-2 md:gap-4 px-4"
      style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {/* ── Hamburger (mobile only) — открывает off-canvas sidebar ── */}
      <button
        onClick={toggleSidebar}
        aria-label={tNav('toggle_menu')}
        className="md:hidden flex items-center justify-center rounded-lg transition flex-shrink-0"
        style={{ width: 40, height: 40, color: 'var(--text-muted)' }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Logo + Campus name ── */}
      <div
        className="flex items-center gap-3 flex-shrink-0"
        style={{ borderInlineStart: '3px solid #4BAED4', paddingInlineStart: 12 }}
      >
        <Image src="/logo.png" alt={tNav('logo_alt')} width={47} height={40} priority
          style={{ height: 40, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <span
          className="hidden lg:block"
          style={{ color: 'var(--accent-strong)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {t.campusName}
        </span>
        <span
          className="hidden sm:block lg:hidden"
          style={{ color: 'var(--accent-strong)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {t.campusNameShort}
        </span>
      </div>

      {/* ── Search (скрыт на телефоне, чтобы шапка помещалась в 375px) ── */}
      <div className="hidden sm:contents">
        <GlobalSearch searchHint={t.searchHint} />
      </div>
      {/* Спейсер, когда поиск скрыт (мобайл) */}
      <div className="flex-1 sm:hidden" />

      {/* ── Right actions ── */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Поиск людей на телефоне: лупа открывает панель с тем же GlobalSearch */}
        <button
          onClick={() => setMobileSearchOpen(v => !v)}
          aria-label={tSearch('placeholder')}
          aria-expanded={mobileSearchOpen}
          className="sm:hidden icon-ghost flex items-center justify-center rounded-lg transition flex-shrink-0"
          style={{ width: 36, height: 36, color: 'var(--text-muted)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
        </button>

        {/* Theme toggle (per-user light/dark) */}
        <ThemeToggle />

        {/* Notification bell */}
        <NotificationBell />

        {/* Language switcher — на телефоне переносим в меню пользователя */}
        <div className="hidden sm:flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'var(--surface-2)' }}>
          {(['ru', 'he', 'en'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => { setLang(l); router.refresh() }}
              className="w-8 py-1 rounded text-xs font-semibold transition"
              style={lang === l
                ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)', boxShadow: 'var(--shadow)' }
                : { color: 'var(--text-muted)' }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition"
          >
            <div className="hidden sm:block text-start" style={{ minWidth: 140 }}>
              <p className="text-[13px] font-medium truncate leading-tight" style={{ maxWidth: 160, color: 'var(--text)' }}>
                {userName ?? '—'}
              </p>
              <p className="text-[11px] truncate leading-tight" style={{ maxWidth: 160, color: 'var(--text-faint)' }}>
                {subtitle}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: 'var(--accent-contrast)' }}
            >
              {initials}
            </div>
            <svg
              className={`w-3 h-3 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-faint)' }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenuOpen && (
            <div
              className={`absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-1.5 w-52 max-w-[calc(100vw-1rem)] rounded-xl py-1 z-50`}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
            >
              {ownCardHref ? (
                <Link
                  href={ownCardHref}
                  prefetch={false}
                  onClick={() => setUserMenuOpen(false)}
                  className="menu-item block px-4 py-3 transition"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--accent-strong)' }}>{userName ?? '—'}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
                </Link>
              ) : (
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{userName ?? '—'}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
                </div>
              )}

              {/* Переключатель языка — только на телефоне (в шапке он скрыт) */}
              <div className="sm:hidden flex gap-1 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                {(['ru', 'he', 'en'] as Lang[]).map(l => (
                  <button
                    key={l}
                    onClick={() => { setLang(l); router.refresh() }}
                    className="flex-1 py-2 rounded text-xs font-semibold transition"
                    style={lang === l
                      ? { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }
                      : { color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                onClick={() => { setUserMenuOpen(false); setPwdOpen(true) }}
                className="menu-item w-full flex items-center gap-3 px-4 py-2.5 text-sm transition"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                {t.user.changePassword}
              </button>

              <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />

              <button
                onClick={handleLogout}
                className="menu-item-danger w-full flex items-center gap-3 px-4 py-2.5 text-sm transition"
                style={{ color: 'var(--danger)' }}
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

    {/* Мобильная панель поиска: под шапкой, во всю ширину; фон закрывает её. */}
    {mobileSearchOpen && (
      <div className="sm:hidden">
        <div
          className="fixed inset-0 z-40"
          style={{ top: 64, background: 'rgba(0,0,0,0.25)' }}
          onClick={() => setMobileSearchOpen(false)}
        />
        <div
          className="fixed inset-x-0 z-50 px-4 py-3"
          style={{ top: 64, background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
        >
          <GlobalSearch
            searchHint={t.searchHint}
            inputId="global-search-mobile"
            autoFocus
            fullWidth
            onDone={() => setMobileSearchOpen(false)}
          />
        </div>
      </div>
    )}

    {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
    </>
  )
}
