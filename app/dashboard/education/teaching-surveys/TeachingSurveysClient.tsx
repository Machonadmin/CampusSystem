'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface SurveyRow { id: string; title: string; is_open: boolean; created_at: string; responses: number }

export default function TeachingSurveysClient() {
  const t = useTranslations('education.teaching_surveys')
  const tNav = useTranslations('navigation')
  const [items, setItems] = useState<SurveyRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch('/api/education/teaching-surveys').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }))
    setItems(d.items ?? [])
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    const tt = title.trim()
    if (!tt) return
    setBusy(true)
    try {
      await fetch('/api/education/teaching-surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: tt }) })
      setTitle('')
      await load()
    } finally { setBusy(false) }
  }

  async function toggleOpen(s: SurveyRow) {
    setBusy(true)
    try {
      await fetch(`/api/education/teaching-surveys/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_open: !s.is_open }) })
      await load()
    } finally { setBusy(false) }
  }

  async function remove(s: SurveyRow) {
    if (!(await confirmDialog({ message: t('confirm_delete'), tone: 'danger' }))) return
    setBusy(true)
    try {
      await fetch(`/api/education/teaching-surveys/${s.id}`, { method: 'DELETE' })
      await load()
    } finally { setBusy(false) }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('survey_title_placeholder')}
          onKeyDown={e => { if (e.key === 'Enter') create() }}
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }} />
        <button onClick={create} disabled={busy || !title.trim()}
          style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', opacity: busy || !title.trim() ? 0.6 : 1 }}>
          {t('create')}
        </button>
      </div>

      {!loaded ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(s => (
            <div key={s.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Link href={`/dashboard/education/teaching-surveys/${s.id}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{s.title}</Link>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
                  {s.responses} {t('responses_short')}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: s.is_open ? 'rgba(16,185,129,0.14)' : 'var(--surface-2)', color: s.is_open ? '#047857' : 'var(--text-faint)' }}>
                {s.is_open ? t('is_open') : t('is_closed')}
              </span>
              <button onClick={() => toggleOpen(s)} disabled={busy}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)' }}>
                {s.is_open ? t('close') : t('open')}
              </button>
              <Link href={`/dashboard/education/teaching-surveys/${s.id}`}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent-tint)', color: 'var(--accent-strong)', textDecoration: 'none' }}>
                {t('manage')}
              </Link>
              <button onClick={() => remove(s)} disabled={busy}
                style={{ fontSize: 12, fontWeight: 600, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--danger)' }}>
                {t('delete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
