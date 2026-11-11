'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Launcher } from './StudiesDashboard'
import YearRolloverTab from './YearRolloverTab'

// Раздел «פעולות»: пусковая панель, вынесенная из дашборда (owner: дашборд =
// только данные). Все действия «Учёбы» сгруппированы в одном месте.
// «מעבר שנה» открывается здесь же подэкраном (?sub=year_rollover) — раньше он
// жил в «הגדרות», но это действие над ученицами, а не настройка.
export default function StudiesActions() {
  const t = useTranslations('education.study.dashboard')
  const tStudy = useTranslations('education.study')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sub = searchParams.get('sub') === 'year_rollover' ? 'year_rollover' : null
  // null = ещё грузим (скелет); {} = ошибка (fail-closed: карточки с acc скрыты); объект = реальный доступ.
  const [access, setAccess] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/education/launcher-access')
      .then(r => (r.ok ? r.json() : {}))
      .then(body => { if (alive) setAccess((body && typeof body === 'object' ? body : {}) as Record<string, boolean>) })
      .catch(() => { if (alive) setAccess({} as Record<string, boolean>) })
    return () => { alive = false }
  }, [])

  if (sub === 'year_rollover') {
    const back = () => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('sub')
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    }
    return (
      <div>
        <button
          type="button"
          onClick={back}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, padding: 0 }}
        >
          <span style={{ fontSize: 15 }}>‹</span>{tStudy('tabs.actions')}
        </button>
        <YearRolloverTab />
      </div>
    )
  }

  return <Launcher t={t} access={access} />
}
