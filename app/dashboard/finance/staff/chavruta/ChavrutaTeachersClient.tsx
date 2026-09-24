'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// Решение владельца №6 (structure-review, 24.09.2026): моры хавруты и пары
// управляются ТОЛЬКО в «מרכז חברותא» (/dashboard/education/chavruta). Здесь,
// рядом с расчётными листами, список — только для просмотра, со ссылкой на хаб.
// API не менялись (POST/DELETE по-прежнему доступны хабу).

// ── Types ─────────────────────────────────────────────────────────────────────

interface Teacher {
  person_id: string
  name: string
  source: 'kodesh' | 'manual'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChavrutaTeachersClient() {
  const t = useTranslations('chavruta')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('finance', 'primary')

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loaded, setLoaded] = useState(false)
  const [featureOff, setFeatureOff] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chavruta/teachers')
      if (res.status === 403) { setForbidden(true); setTeachers([]); return }
      if (res.status === 503) { setFeatureOff(true); setTeachers([]); return }
      if (!res.ok) { setTeachers([]); return }
      const b = await res.json()
      setTeachers(b?.teachers ?? [])
    } catch {
      setTeachers([])
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('teachers_title') },
      ]} />

      {/* Header */}
      <ModuleHeader module="finance" title={t('teachers_title')} subtitle={t('teachers_subtitle')} />

      {!loaded ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : forbidden ? (
        // Нет права просмотра — общий «אין לך הרשאה» (раньше тут ошибочно
        // показывалось «עמוד זה מיועד למורות חברותא»).
        <ForbiddenState />
      ) : featureOff ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>{t('feature_not_ready')}</div>
      ) : (
        <>
          {/* Только просмотр: управление — в хабе (решение №6). */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('managed_in_hub_note')}</span>
            <Link
              href="/dashboard/education/chavruta"
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600, color: accent,
                background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
                borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >{t('open_hub')}</Link>
          </div>

          {/* Teachers table */}
          {teachers.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_teachers')}</div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('col_name')}</th>
                    <th style={th}>{t('col_source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(tc => (
                    <tr key={tc.person_id}>
                      <td data-label={t('col_name')} style={{ ...td, fontWeight: 500 }}>{tc.name || '—'}</td>
                      <td data-label={t('col_source')} style={td}>
                        <span style={{
                          display: 'inline-block', fontSize: 11, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 999,
                          background: tc.source === 'kodesh' ? 'var(--surface-2)' : 'var(--accent-tint, #ECFDF5)',
                          color: tc.source === 'kodesh' ? 'var(--text-muted)' : accent,
                          border: '1px solid var(--border)',
                        }}>
                          {tc.source === 'kodesh' ? t('source_kodesh') : t('source_manual')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
