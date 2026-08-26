'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import StudentDashboardPanel from '@/components/education/StudentDashboardPanel'
import StudentMessagesPanel from '@/components/education/StudentMessagesPanel'
import StudentCalendarPanel from '@/components/education/StudentCalendarPanel'
import StudentGradesPanel from '@/components/education/StudentGradesPanel'
import StudentChavrutaPanel from '@/components/education/StudentChavrutaPanel'
import StudentShabbatPanel from '@/components/education/StudentShabbatPanel'
import StudentTeachingSurveyPanel from '@/components/education/StudentTeachingSurveyPanel'
import MeetingsPanel from '@/components/education/MeetingsPanel'
import ForcePasswordChangeGate from '@/components/auth/ForcePasswordChangeGate'
import { SubmitButton } from '@/components/ui/SubmitButton'

/**
 * Оболочка личного кабинета студентки: приветствие, три панели (дашборд,
 * календарь, встречи) для её journey и выход. Встречи — только для чтения
 * (canEdit={false}): студентка не создаёт и не меняет встречи.
 */
export default function PortalClient({ journeyId, name }: { journeyId: string; name: string }) {
  const t = useTranslations('portal')
  const { lang, setLang } = useLang()
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
      <ForcePasswordChangeGate portal />
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 14 }}>
        {/* Приветствие + выход */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('greeting')}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{name || t('my_studies')}</div>
          </div>
          {/* Переключатель языка (иврит/англ/рус) — как в шапке основного приложения. */}
          <div style={{ display: 'flex', gap: 2, borderRadius: 8, padding: 2, background: 'var(--surface-2)' }}>
            {(['he', 'en', 'ru'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => { setLang(l); router.refresh() }}
                style={{
                  width: 32, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: lang === l ? 'var(--accent)' : 'transparent',
                  color: lang === l ? 'var(--accent-contrast, #fff)' : 'var(--text-muted)',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <SubmitButton
            onClick={logout}
            loading={busy}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px' }}
          >
            {t('logout')}
          </SubmitButton>
        </div>

        <StudentMessagesPanel journeyId={journeyId} />
        <StudentDashboardPanel journeyId={journeyId} />
        <StudentCalendarPanel journeyId={journeyId} personal />
        <StudentGradesPanel journeyId={journeyId} />
        <StudentChavrutaPanel journeyId={journeyId} />
        <StudentShabbatPanel journeyId={journeyId} />
        <StudentTeachingSurveyPanel />
        <MeetingsPanel journeyId={journeyId} canEdit={false} />
      </div>
    </div>
  )
}
