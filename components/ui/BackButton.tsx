'use client'

import { useSafeBack } from '@/lib/hooks/useSafeBack'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Кнопка «חזרה» для шапки карточки (слот `actions` у <ModuleHeader/>).
 * Возвращает РЕАЛЬНЫМ back туда, откуда пришли (список, другая карточка,
 * задача), а не в родителя по иерархии, как хлебные крошки. Без истории
 * (прямая ссылка, первая запись PWA) — в `fallback` (список модуля).
 */
export function BackButton({ fallback }: { fallback: string }) {
  const tCommon = useTranslations('common')
  const goBack = useSafeBack(fallback)
  return (
    <button
      type="button"
      onClick={goBack}
      style={{
        padding: '8px 14px', fontSize: 13, fontWeight: 500,
        background: 'var(--surface-2)', color: 'var(--text)',
        border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {tCommon('back')}
    </button>
  )
}
