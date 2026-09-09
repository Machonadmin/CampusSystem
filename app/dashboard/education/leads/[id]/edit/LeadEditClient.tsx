'use client'

import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'
import ProcessInfoBlock from '@/components/workflow/ProcessInfoBlock'

interface Props {
  journeyId: string
  personName: string
}

export default function LeadEditClient({ journeyId, personName }: Props) {
  const router = useRouter()
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const viewHref = `/dashboard/education/leads/${journeyId}`

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('card.section.lead'), href: '/dashboard/education' },
        { label: personName, href: viewHref },
        { label: tCommon('edit') },
      ]} />

      <ModuleHeader
        module="education"
        title={personName}
        subtitle={t('card.labels.lead_editing')}
        actions={
          <button
            onClick={() => router.push(viewHref)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.2)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {t('card.labels.back_to_view')}
          </button>
        }
      />

      <div className="split-cols" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 350px',
        gap: 20,
        alignItems: 'start',
      }}>
        <EducationJourneyForm
          mode="lead"
          inline
          journeyId={journeyId}
          onClose={() => router.push(viewHref)}
          onSaved={() => router.push(viewHref)}
        />
        <ProcessInfoBlock journeyId={journeyId} />
      </div>
    </div>
  )
}
