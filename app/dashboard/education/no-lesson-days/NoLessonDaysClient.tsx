'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'

const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'
const accent = getModuleColor('education')

interface Day { id: string; year_label: string; date: string; reason: string | null; scope: string }
interface TemplateDay { id: string; month: number; day: number; reason: string | null }
interface Template { id: string; name: string; is_active: boolean; days: TemplateDay[] }

export default function NoLessonDaysClient() {
  const t = useTranslations('education.no_lesson_days')

  const [year, setYear] = useState('')
  const [gregYear, setGregYear] = useState<number>(new Date().getFullYear())
  const [days, setDays] = useState<Day[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Форма добавления дня.
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newScope, setNewScope] = useState<'all' | 'kodesh'>('all')

  const scopeToValue = (s: 'all' | 'kodesh') => (s === 'all' ? 'all' : KODESH_DEPT_ID)

  const loadDays = useCallback(async (yr: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/no-lesson-days${yr ? `?year=${encodeURIComponent(yr)}` : ''}`)
      if (res.ok) { const b = await res.json(); setDays(b.days ?? []) }
    } finally { setLoading(false) }
  }, [])

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/education/no-lesson-days/templates')
    if (res.ok) { const b = await res.json(); setTemplates(b.templates ?? []) }
  }, [])

  useEffect(() => { loadDays(year); loadTemplates() }, [loadDays, loadTemplates, year])

  const addDay = async () => {
    if (!year.trim()) { toast(t('year_required'), 'error'); return }
    if (!newDate) { toast(t('date_required'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/no-lesson-days', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_label: year.trim(), date: newDate, reason: newReason.trim() || null, scope: scopeToValue(newScope) }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
      setNewDate(''); setNewReason('')
      loadDays(year)
    } finally { setBusy(false) }
  }

  const deleteDay = async (d: Day) => {
    if (!(await confirmDialog({ message: t('confirm_delete').replace('{date}', d.date), tone: 'danger' }))) return
    const res = await fetch(`/api/education/no-lesson-days/${d.id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
    loadDays(year)
  }

  const suggest = async (tpl: Template) => {
    if (!year.trim()) { toast(t('year_required'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/no-lesson-days/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: tpl.id, year_label: year.trim(), gregorian_year: gregYear, scope: scopeToValue(newScope) }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
      const b = await res.json()
      toast(t('suggested').replace('{n}', String(b.inserted ?? 0)), 'success')
      loadDays(year)
    } finally { setBusy(false) }
  }

  const scopeLabel = (s: string) => (s === 'all' ? t('scope_all') : s === KODESH_DEPT_ID ? t('scope_kodesh') : s)

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }
  const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Выбор года */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('year_label')}</span>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder={t('year_placeholder')} dir="rtl" style={{ ...inp, width: 140 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('greg_year_label')}</span>
          <input type="number" value={gregYear} onChange={e => setGregYear(Number(e.target.value) || gregYear)} style={{ ...inp, width: 100 }} />
        </label>
      </div>

      {/* Добавление дня */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('date_label')}</span>
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 160 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('reason_label')}</span>
          <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder={t('reason_placeholder')} style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('scope_label')}</span>
          <select value={newScope} onChange={e => setNewScope(e.target.value as 'all' | 'kodesh')} style={inp}>
            <option value="all">{t('scope_all')}</option>
            <option value="kodesh">{t('scope_kodesh')}</option>
          </select>
        </label>
        <button onClick={addDay} disabled={busy} style={btn}>{t('add_day')}</button>
      </div>

      {/* Список дней */}
      {loading ? <SkeletonRows avatar={false} rows={4} /> : (
        days.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {days.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', minWidth: 110 }} dir="ltr">{d.date}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>{d.reason || '—'}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 999, padding: '2px 10px' }}>{scopeLabel(d.scope)}</span>
                <button onClick={() => deleteDay(d)} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>{t('delete')}</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Шаблоны */}
      <div style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '4px 0 0' }}>{t('templates_title')}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('templates_hint')}</p>
        {templates.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('templates_empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {templates.map((tpl, i) => (
              <div key={tpl.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{tpl.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('template_days_count').replace('{n}', String(tpl.days.length))}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => suggest(tpl)} disabled={busy} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                  {t('suggest_button')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
