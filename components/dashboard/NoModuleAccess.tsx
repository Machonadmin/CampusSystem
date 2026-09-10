'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import type { ModuleAccessDiagnosis } from '@/lib/permissions/diagnose'

/**
 * Экран «нет доступа к модулю» вместо молчаливого redirect('/dashboard').
 *
 * ЗАЧЕМ. Плитка модуля на главной и пункт в меню показываются по праву
 * `<module>.access`, а сама страница требует `<module>.view`. Когда есть первое
 * и нет второго, человек видит модуль, кликает — и его возвращает на главную
 * без единого слова. Со стороны это «почему-то не пускает», и владелец не может
 * это починить, потому что система знает причину, но выбрасывает её.
 *
 * Здесь причина показана прямо: какие права у человека есть, какого не хватает
 * и где его выдать. Никакие права этим экраном НЕ расширяются — внутрь модуля
 * по-прежнему попадают ровно те же люди.
 */
export default function NoModuleAccess({
  module,
  required,
  diagnosis,
}: {
  /** Код модуля, как в role_privileges ('maintenance'). */
  module: string
  /** Право, которого не хватило странице ('view'). */
  required: string
  diagnosis: ModuleAccessDiagnosis
}) {
  const t = useTranslations('access')
  const tNav = useTranslations('navigation')
  const moduleName = tNav(module, module)

  const { catalog, granted, catalogEmpty, catalogUnknown } = diagnosis
  const grantedSet = new Set(granted)

  // Каталог пуст — права нечего выдавать: они не появятся ни на экране ролей,
  // ни в персональных оверрайдах, пока в module_privileges нет строк модуля.
  const rootCause = catalogUnknown ? 'unknown' : catalogEmpty ? 'catalog' : 'privilege'

  return (
    <div className="p-6" style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, display: 'grid', gap: 14,
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            {t('subtitle').replace('{module}', moduleName)}
          </p>
        </div>

        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 14, display: 'grid', gap: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            {t('diagnosis')}
          </div>

          {rootCause === 'unknown' ? (
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{t('cause_unknown')}</p>
          ) : rootCause === 'catalog' ? (
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
              {t('cause_catalog').replace('{module}', module)}
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
                {t('cause_privilege')
                  .replace('{privilege}', `${module}.${required}`)
                  .replace('{module}', moduleName)}
              </p>
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4 }}>
                {catalog.map(code => {
                  const has = grantedSet.has(code)
                  return (
                    <li key={code} style={{ fontSize: 13, color: has ? 'var(--success)' : 'var(--danger)' }}>
                      <span style={{ fontFamily: 'monospace' }}>{module}.{code}</span>
                      {' — '}
                      {has ? t('has') : t('missing')}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {rootCause === 'catalog' ? t('fix_catalog') : t('fix_privilege')}
        </p>

        <div>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-block', fontSize: 13, fontWeight: 600, padding: '8px 16px',
              border: '1px solid var(--border-strong)', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--text)', textDecoration: 'none',
            }}
          >
            ← {t('back_home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
