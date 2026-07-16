'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import StudentDashboardPanel from '@/components/education/StudentDashboardPanel'
import StudentMessagesPanel from '@/components/education/StudentMessagesPanel'
import StudentCalendarPanel from '@/components/education/StudentCalendarPanel'
import StudentGradesPanel from '@/components/education/StudentGradesPanel'
import MeetingsPanel from '@/components/education/MeetingsPanel'

/**
 * Оболочка личного кабинета студентки: приветствие, три панели (дашборд,
 * календарь, встречи) для её journey и выход. Встречи — только для чтения
 * (canEdit={false}): студентка не создаёт и не меняет встречи.
 */
export default function PortalClient({ journeyId, name }: { journeyId: string; name: string }) {
  const t = useTranslations('portal')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/portal/logout', { method: 'POST' })
      router.push('/portal/login')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 16 }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 14 }}>
        {/* Приветствие + выход */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('greeting')}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{name || t('my_studies')}</div>
          </div>
          <button
            onClick={logout}
            disabled={busy}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {t('logout')}
          </button>
        </div>

        <StudentMessagesPanel journeyId={journeyId} />
        <StudentDashboardPanel journeyId={journeyId} />
        <StudentCalendarPanel journeyId={journeyId} />
        <StudentGradesPanel journeyId={journeyId} />
        <MeetingsPanel journeyId={journeyId} canEdit={false} />
      </div>
    </div>
  )
}
