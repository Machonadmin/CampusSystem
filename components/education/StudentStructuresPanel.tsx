'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'

// Многоструктурное членство студентки (טורו ⊂ אוניברסיטה). Основная структура
// (primary_department) не здесь — здесь ТОЛЬКО дополнительные. Управляет
// руководитель целевой структуры (право проверяет сервер).

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Membership { department_id: string; department: Dept | null }

const accent = getModuleColor('education')

export default function StudentStructuresPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.structures')
  const { lang } = useLang()
  const [items, setItems] = useState<Membership[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [sRes, dRes] = await Promise.all([
      fetch(`/api/education/journeys/${journeyId}/structures`),
      fetch('/api/settings/departments'),
    ])
    if (sRes.ok) { const j = await sRes.json(); setItems(j.structures ?? []) }
    if (dRes.ok) { const d = await dRes.json(); setDepartments(Array.isArray(d) ? d : (d.departments ?? [])) }
    setLoaded(true)
  }, [journeyId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!pick) return
    setBusy(true)
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/structures`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ department_id: pick }),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.error ?? t('add'), 'error'); return }
      setPick(''); load()
    } finally { setBusy(false) }
  }

  const remove = async (deptId: string) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/structures?department_id=${encodeURIComponent(deptId)}`, { method: 'DELETE' })
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.error ?? t('remove'), 'error'); return }
      load()
    } finally { setBusy(false) }
  }

  if (!loaded) return null

  const takenIds = new Set(items.map(i => i.department_id))
  const options = departments.filter(d => !takenIds.has(d.id))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('title')}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>{t('hint')}</div>

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 12 }}>{t('none')}</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {items.map(m => (
            <span key={m.department_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 99, padding: '4px 6px 4px 12px' }}>
              {m.department ? localizedDeptName(m.department, lang) : m.department_id}
              <button
                type="button"
                onClick={() => remove(m.department_id)}
                disabled={busy}
                title={t('remove')}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.06)', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}
              >×</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={pick} onChange={e => setPick(e.target.value)} style={{ flex: '1 1 180px', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)' }}>
          <option value="">{t('pick')}</option>
          {options.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={busy || !pick}
          style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: busy || !pick ? 'default' : 'pointer', opacity: busy || !pick ? 0.5 : 1 }}
        >
          {t('add')}
        </button>
      </div>
    </div>
  )
}
