'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { canGoBackInApp, useSafeBack } from '@/lib/hooks/useSafeBack'
import { markRefreshOnReturn } from '@/lib/nav/refresh-on-return'
import { EDUCATION_SECTION_ROUTES } from '@/lib/education/education-hub'
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
  // Пришли из карточки (?from=card) — после сохранения возвращаемся на неё
  // реальным back (форма не остаётся в истории: иначе «назад» с карточки снова
  // открывал форму) и обновляем данные. Пришли из списка — заменяем форму
  // карточкой (replace), «назад» с неё вернёт в список.
  const fromCard = useSearchParams().get('from') === 'card'
  // «Назад» / «Отмена» — туда, откуда пришли (карточка или список).
  const goBack = useSafeBack(viewHref)
  function afterSave() {
    if (fromCard && canGoBackInApp()) {
      markRefreshOnReturn(viewHref)
      router.back()
    } else {
      router.replace(viewHref)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('card.section.lead'), href: EDUCATION_SECTION_ROUTES.recruitment },
        { label: personName, href: viewHref },
        { label: tCommon('edit') },
      ]} />

      <ModuleHeader
        module="education"
        title={personName}
        subtitle={t('card.labels.lead_editing')}
        actions={
          <button
            onClick={goBack}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: 'var(--surface-2)', color: 'var(--text)',
              border: '1px solid var(--border-strong)', borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {tCommon('back')}
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
          onClose={goBack}
          onSaved={afterSave}
        />
        <ProcessInfoBlock journeyId={journeyId} />
      </div>
    </div>
  )
}
