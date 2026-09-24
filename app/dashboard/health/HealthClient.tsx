'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { useUrlTab } from '@/lib/nav/useUrlTab'
import DoctorListClient from '../doctor/DoctorListClient'
import PsychologistListClient from '../psychologist/PsychologistListClient'

/**
 * Обёртка «Здоровье»: один заголовок + вкладки «Медпункт» / «Психолог».
 * Рендерится только когда доступны ОБА модуля (иначе page.tsx редиректит).
 * Градиент шапки следует активной вкладке — сохраняет привычные цвета модулей.
 */
export default function HealthClient({ canManageDoctor, canManagePsych }: {
  canManageDoctor: boolean
  canManagePsych: boolean
}) {
  const { t } = useLang()
  const tDoctor = useTranslations('doctor')
  const tPsych = useTranslations('psychologist')
  const tNav = useTranslations('navigation')
  // Вкладка «מרפאה/פסיכולוג» — навигация: держим в URL (?tab=), чтобы «назад»
  // возвращал на прежнюю вкладку, а ссылка/обновление открывали ту же.
  const [tab, setTab] = useUrlTab({ allowed: ['doctor', 'psychologist'] as const, fallback: 'doctor' })

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
        { label: t.nav.health },
      ]} />

      <ModuleHeader module={tab} title={t.nav.health} subtitle={t.moduleDesc.health} />

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setTab('doctor')} style={tabBtn(tab === 'doctor')}>{tDoctor('title')}</button>
        <button type="button" onClick={() => setTab('psychologist')} style={tabBtn(tab === 'psychologist')}>{tPsych('title')}</button>
      </div>

      {tab === 'doctor'
        ? <DoctorListClient canManage={canManageDoctor} embedded />
        : <PsychologistListClient canManage={canManagePsych} embedded />}
    </div>
  )
}
