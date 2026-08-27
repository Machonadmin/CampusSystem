import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getCookieLocale } from '@/lib/i18n/locale'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import PortalLoginForm from './PortalLoginForm'

const messagesByLocale = { ru: ruMessages, he: heMessages, en: enMessages }

/**
 * Страница входа студентки. Публичная (см. PUBLIC_PAGES в middleware). Если уже
 * есть валидная сессия студентки — сразу в /portal.
 */
export default async function PortalLoginPage() {
  const session = await getSession()
  if (session && session.principal === 'student' && session.student_journey_id) {
    redirect('/portal')
  }

  const t = messagesByLocale[getCookieLocale()].portal

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'radial-gradient(1100px 520px at 50% -8%, var(--accent-tint), transparent 62%), var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, margin: '0 auto 14px', borderRadius: 15,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 10L12 5 2 10l10 5 10-5z" />
              <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{t.login_title}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{t.my_studies}</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: 'var(--shadow)' }}>
          <PortalLoginForm />
        </div>
      </div>
    </div>
  )
}
