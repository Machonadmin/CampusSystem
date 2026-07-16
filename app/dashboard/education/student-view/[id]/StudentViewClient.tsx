'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import StudentDashboardPanel from '@/components/education/StudentDashboardPanel'
import StudentCalendarPanel from '@/components/education/StudentCalendarPanel'
import MeetingsPanel from '@/components/education/MeetingsPanel'

export default function StudentViewClient({ journeyId, name }: { journeyId: string; name: string }) {
  const t = useTranslations('education.student_view')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 14 }}>
        {/* Баннер предпросмотра */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--violet-tint)', border: '1px solid var(--violet)', borderRadius: 10, padding: '9px 14px' }}>
          <span style={{ fontSize: 16 }}>👁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--violet)' }}>{t('preview_banner')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('preview_hint')}</div>
          </div>
          <a href="/dashboard/education" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '5px 12px' }}>{t('back')}</a>
        </div>

        {/* Приветствие */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('hello')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{name || t('student')}</div>
        </div>

        {/* Ровно то, что видит студентка */}
        <StudentDashboardPanel journeyId={journeyId} />
        <StudentCalendarPanel journeyId={journeyId} />
        <MeetingsPanel journeyId={journeyId} canEdit={false} />
      </div>
    </div>
  )
}
