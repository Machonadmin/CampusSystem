'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'

interface Props {
  journeyId: string
  personName: string
}

/**
 * Правка личных данных студентки. Использует ту же форму, что и гиюс — но с
 * routeBase студентки. Академические данные (мехлака/התמחות/группа) правятся не
 * здесь, а во вкладке «учебный цикл» карточки; здесь — личные данные, контакты,
 * семья, община, направления (то же множество полей, что редактируется в гиюсе).
 */
export default function StudentEditClient({ journeyId, personName }: Props) {
  const router = useRouter()
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const viewHref = `/dashboard/education/students/${journeyId}`

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('card.section.student'), href: '/dashboard/education' },
        { label: personName, href: viewHref },
        { label: tCommon('edit') },
      ]} />

      <ModuleHeader
        module="education"
        title={personName}
        subtitle={t('card.labels.student_editing')}
        actions={
          <button
            onClick={() => router.push(viewHref)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: 'var(--surface-2)', color: 'var(--text)',
              border: '1px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {t('card.labels.back_to_view')}
          </button>
        }
      />

      {savedAt && (
        <div style={{
          background: 'var(--success-tint)', border: '1px solid var(--success)', borderRadius: 8,
          padding: '10px 16px', fontSize: 13, color: 'var(--success)',
        }}>
          {t('card.labels.data_saved')}
        </div>
      )}

      <EducationJourneyForm
        mode="lead"
        inline
        journeyId={journeyId}
        onClose={() => router.push(viewHref)}
        onSaved={() => { setSavedAt(new Date()); router.push(viewHref) }}
      />
    </div>
  )
}
