'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Единое сообщение «нет доступа» внутри экрана, когда основной запрос вернул 403.
 * Раньше каждый экран вёл себя по-своему: пустой список («אין מקצועות») с кнопкой
 * «+ הוסף», красное «שגיאה בטעינה» или тост — человек не понимал, что дело в правах.
 */
export function ForbiddenState() {
  const t = useTranslations('access')
  return (
    <div role="status" style={{ padding: '48px 24px', textAlign: 'center', fontSize: 14, color: 'var(--text-faint)' }}>
      {t('title')}
    </div>
  )
}
