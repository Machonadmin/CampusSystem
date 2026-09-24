'use client'

import { useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import TeachersHoursClient from '../teachers-hours/TeachersHoursClient'
import TeacherAttendanceClient from '../teacher-attendance/TeacherAttendanceClient'

/**
 * Обёртка «מורים»: один заголовок + вкладки «Часы» / «Посещаемость».
 * Без права на часы (view_students) вкладок нет — сразу посещаемость.
 */
export default function TeachersClient({ canHours, canApprove }: { canHours: boolean; canApprove: boolean }) {
  const t = useTranslations('education.teachers_hub')
  const tNav = useTranslations('navigation')
  const [tab, setTab] = useState<'hours' | 'attendance'>(canHours ? 'hours' : 'attendance')

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
    background: active ? 'var(--accent-tint)' : 'var(--surface)',
    color: active ? 'var(--accent-strong)' : 'var(--text-muted)',
  })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <ModuleHeader module="education" title={t('title')} subtitle={t('subtitle')} />

      {canHours && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setTab('hours')} style={tabBtn(tab === 'hours')}>{t('tab_hours')}</button>
          <button type="button" onClick={() => setTab('attendance')} style={tabBtn(tab === 'attendance')}>{t('tab_attendance')}</button>
        </div>
      )}

      {tab === 'hours' && canHours
        ? <TeachersHoursClient embedded />
        : <TeacherAttendanceClient canApprove={canApprove} embedded />}
    </div>
  )
}
