'use client'

import { useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import EducationHeaderNav from './EducationHeaderNav'
import { SkeletonRows } from '@/components/ui/Skeleton'

/**
 * Оболочка отдельного раздела «Учёбы» как САМОСТОЯТЕЛЬНОГО модуля (запрос
 * владельца: גיוס / קבלה / לимודים — раздельные модули, без «התנגשויות»).
 * Каждый раздел живёт на своём маршруте (/dashboard/education/{recruitment|
 * admission|studies}) и МОНТИРУЕТСЯ заново при переходе — поэтому состояние и
 * фильтры одного раздела не «протекают» в другой. Оболочка даёт общую шапку
 * (крошки + градиент + заголовок) и проверку доступа к разделу.
 *
 * sectionKey — ключ права из /api/education/tab-access (recruitment/committee/
 * study). titleKey — ключ заголовка в namespace 'education'.
 */
export default function SectionShell({
  sectionKey,
  titleKey,
  children,
}: {
  sectionKey: 'recruitment' | 'committee' | 'study'
  titleKey: string
  children: React.ReactNode
}) {
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const label = t(titleKey)

  // null = ещё грузим, true = есть доступ, false = нет. Пока не подтверждён
  // доступ — контент НЕ рендерим (иначе секретарь кодеша на миг видит גיוס).
  // Fail-closed: любая ошибка/невалидный ответ → доступа нет.
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/education/tab-access')
      .then(r => (r.ok ? r.json() : null))
      .then(a => { if (alive) setAllowed(!!a && a[sectionKey] === true) })
      .catch(() => { if (alive) setAllowed(false) })
    return () => { alive = false }
  }, [sectionKey])

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 14, padding: '11px 22px',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <h1 style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <svg style={{ width: 19, height: 19 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>{label}
        </h1>
        <EducationHeaderNav />
      </div>

      {allowed === true ? children : (
        <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 14, color: 'var(--text-faint)' }}>
          {allowed === false ? t('no_access') : <SkeletonRows />}
        </div>
      )}
    </div>
  )
}
