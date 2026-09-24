'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Launcher } from './StudiesDashboard'

// Раздел «פעולות»: пусковая панель, вынесенная из дашборда (owner: дашборд =
// только данные). Все действия «Учёбы» сгруппированы в одном месте.
export default function StudiesActions() {
  const t = useTranslations('education.study.dashboard')
  // null = ещё грузим (скелет); {} = ошибка (fail-open); объект = реальный доступ.
  const [access, setAccess] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/education/launcher-access')
      .then(r => (r.ok ? r.json() : {}))
      .then(body => { if (alive) setAccess((body && typeof body === 'object' ? body : {}) as Record<string, boolean>) })
      .catch(() => { if (alive) setAccess({} as Record<string, boolean>) })
    return () => { alive = false }
  }, [])

  return <Launcher t={t} access={access} />
}
