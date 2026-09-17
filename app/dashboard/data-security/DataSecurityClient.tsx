'use client'

import { useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { useUrlTab } from '@/lib/nav/useUrlTab'
import type { BuiltTree } from '@/lib/data-security/tree'
import type { StaffSummary } from '@/lib/data-security/load'
import type { UnitNode } from '@/lib/data-security/units'
import GeneralView from './GeneralView'
import PersonView from './PersonView'

/**
 * «Безопасность данных» — ровно ДВА вида, как просил владелец:
 *   общий      — здесь наводят порядок в структуре;
 *   по сотруднику — здесь утверждают доступ конкретному человеку.
 * Ничего третьего в этом разделе быть не должно.
 *
 * Вкладка держится в URL (?tab=), чтобы «назад» возвращал на прежний вид, а
 * ссылка открывала тот же — как в остальных модулях (lib/nav/useUrlTab).
 */
export default function DataSecurityClient({
  initialTree, initialUnits, staff, departments, canGrant, canManageTree, canManageUnits,
}: {
  initialTree: BuiltTree
  initialUnits: UnitNode[]
  staff: StaffSummary[]
  departments: { id: string; name: string }[]
  canGrant: boolean
  canManageTree: boolean
  canManageUnits: boolean
}) {
  const t = useTranslations('data_security')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()
  const [tree, setTree] = useState(initialTree)
  const [units, setUnits] = useState(initialUnits)

  const [tab, setTab] = useUrlTab({
    allowed: ['general', 'person'] as const,
    fallback: 'general',
  })

  const tabButton = (key: 'general' | 'person', label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      style={{
        padding: '8px 18px', border: 0, borderRadius: 8,
        background: tab === key ? 'var(--surface)' : 'transparent',
        color: tab === key ? 'var(--text)' : 'var(--text-muted)',
        fontSize: 13, fontWeight: tab === key ? 700 : 600, cursor: 'pointer',
        boxShadow: tab === key ? 'var(--shadow)' : undefined,
      }}
    >{label}</button>
  )

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[{ label: tNav('home'), href: '/dashboard' }, { label: t('title') }]} />

      <ModuleHeader
        module="data_security"
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
            {tabButton('general', t('tab_general'))}
            {tabButton('person', t('tab_person'))}
          </div>
        }
      />

      {tab === 'general' ? (
        <GeneralView
          tree={tree}
          units={units}
          departments={departments}
          canManageTree={canManageTree}
          canManageUnits={canManageUnits}
          t={t}
          lang={lang}
          onReload={setTree}
          onUnitsReload={setUnits}
        />
      ) : (
        <PersonView
          tree={tree}
          staff={staff}
          units={units}
          canGrant={canGrant}
          canManageUnits={canManageUnits}
          t={t}
          lang={lang}
        />
      )}
    </div>
  )
}
