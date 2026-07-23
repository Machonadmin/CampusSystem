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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{t.login_title}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{t.my_studies}</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          <PortalLoginForm />
        </div>
      </div>
    </div>
  )
}
