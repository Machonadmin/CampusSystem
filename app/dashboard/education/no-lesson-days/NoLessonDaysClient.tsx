'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'
const accent = getModuleColor('education')

interface DayType {
  code: string
  name_he: string | null
  name_ru: string | null
  name_en: string | null
  blocks_secular: boolean
  blocks_kodesh: boolean
  is_shortened: boolean
  is_active: boolean
  sort_order: number
}
interface Day { id: string; year_label: string; date: string; reason: string | null; scope: string; day_type_code: string }
interface TemplateDay { id: string; month: number; day: number; reason: string | null; day_type_code: string }
interface Template { id: string; name: string; is_active: boolean; days: TemplateDay[] }

export default function NoLessonDaysClient() {
  const t = useTranslations('education.no_lesson_days')
  const { lang } = useLang()

  const [year, setYear] = useState('')
  const [gregYear, setGregYear] = useState<number>(new Date().getFullYear())
  const [days, setDays] = useState<Day[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [dayTypes, setDayTypes] = useState<DayType[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showTypes, setShowTypes] = useState(false)

  // Форма добавления дня.
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newScope, setNewScope] = useState<'all' | 'kodesh'>('all')
  const [newType, setNewType] = useState('full_off')

  const scopeToValue = (s: 'all' | 'kodesh') => (s === 'all' ? 'all' : KODESH_DEPT_ID)
  // Имя типа дня на текущем языке (fallback: другой язык → код). Типы РЕДАКТИРУЕМЫЕ,
  // поэтому подписи берём из БД, не из i18n.
  const typeName = useCallback((code: string): string => {
    const ty = dayTypes.find(x => x.code === code)
    if (!ty) return code === 'full_off' ? t('day_type_all_off') : code
    return (lang === 'he' ? ty.name_he : lang === 'en' ? ty.name_en : ty.name_ru) || ty.name_ru || ty.name_he || ty.name_en || ty.code
  }, [dayTypes, lang, t])

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

  const loadDayTypes = useCallback(async () => {
    // active_only=false — чтобы имя показывалось и для деактивированного типа, на
    // который ссылается существующий день.
    const res = await fetch('/api/education/calendar-day-types?active_only=false')
    if (res.ok) { const b = await res.json(); setDayTypes(b.types ?? []) }
  }, [])

  useEffect(() => { loadDays(year); loadTemplates(); loadDayTypes() }, [loadDays, loadTemplates, loadDayTypes, year])

  const activeTypes = dayTypes.filter(x => x.is_active)
  // Опции селектора: активные типы; если таблица ещё не мигрирована — full_off.
  const typeOptions = activeTypes.length > 0 ? activeTypes : [{ code: 'full_off' } as Pick<DayType, 'code'>]

  const addDay = async () => {
    if (!year.trim()) { toast(t('year_required'), 'error'); return }
    if (!newDate) { toast(t('date_required'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/no-lesson-days', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_label: year.trim(), date: newDate, reason: newReason.trim() || null, scope: scopeToValue(newScope), day_type_code: newType }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
      setNewDate(''); setNewReason('')
      loadDays(year)
    } finally { setBusy(false) }
  }

  const changeDayType = async (d: Day, code: string) => {
    const res = await fetch(`/api/education/no-lesson-days/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_type_code: code }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
    setDays(prev => prev.map(x => (x.id === d.id ? { ...x, day_type_code: code } : x)))
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
  const rowSel: React.CSSProperties = { padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Выбор года + управление типами дней */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('year_label')}</span>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder={t('year_placeholder')} dir="rtl" style={{ ...inp, width: 140 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('greg_year_label')}</span>
          <input type="number" value={gregYear} onChange={e => setGregYear(Number(e.target.value) || gregYear)} style={{ ...inp, width: 100 }} />
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowTypes(true)} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
          {t('manage_day_types')}
        </button>
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
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('day_type_label')}</span>
          <select value={newType} onChange={e => setNewType(e.target.value)} style={inp}>
            {typeOptions.map(ty => <option key={ty.code} value={ty.code}>{typeName(ty.code)}</option>)}
          </select>
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
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', minWidth: 110 }} dir="ltr">{d.date}</span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--text-muted)' }}>{d.reason || '—'}</span>
                <select
                  aria-label={t('day_type_label')}
                  value={d.day_type_code}
                  onChange={e => changeDayType(d, e.target.value)}
                  style={rowSel}
                >
                  {/* активные типы + текущий (даже если деактивирован) */}
                  {(activeTypes.some(x => x.code === d.day_type_code) || activeTypes.length === 0
                    ? activeTypes
                    : [...activeTypes, dayTypes.find(x => x.code === d.day_type_code)].filter(Boolean) as DayType[]
                  ).map(ty => <option key={ty.code} value={ty.code}>{typeName(ty.code)}</option>)}
                  {activeTypes.length === 0 && <option value={d.day_type_code}>{typeName(d.day_type_code)}</option>}
                </select>
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

      {showTypes && <DayTypesModal onClose={() => setShowTypes(false)} onChanged={loadDayTypes} t={t} />}
    </div>
  )
}

// ─── Редактируемый справочник типов дней ─────────────────────────────────────
function DayTypesModal({ onClose, onChanged, t }: { onClose: () => void; onChanged: () => void; t: ReturnType<typeof useTranslations> }) {
  const { lang } = useLang()
  const [types, setTypes] = useState<DayType[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Форма нового типа.
  const [code, setCode] = useState('')
  const [nameHe, setNameHe] = useState('')
  const [nameRu, setNameRu] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [sec, setSec] = useState(false)
  const [kod, setKod] = useState(false)
  const [short, setShort] = useState(false)

  const tn = (ty: DayType) => (lang === 'he' ? ty.name_he : lang === 'en' ? ty.name_en : ty.name_ru) || ty.name_ru || ty.name_he || ty.name_en || ty.code

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/education/calendar-day-types?active_only=false')
      if (res.ok) { const b = await res.json(); setTypes(b.types ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!/^[a-z0-9_]+$/.test(code.trim())) { toast(t('type_code_required'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/calendar-day-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          name_he: nameHe.trim() || null, name_ru: nameRu.trim() || null, name_en: nameEn.trim() || null,
          blocks_secular: sec, blocks_kodesh: kod, is_shortened: short,
          sort_order: (types.length + 1) * 10,
        }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
      setCode(''); setNameHe(''); setNameRu(''); setNameEn(''); setSec(false); setKod(false); setShort(false)
      await load(); onChanged()
    } finally { setBusy(false) }
  }

  const patch = async (ty: DayType, body: Partial<DayType>) => {
    const res = await fetch(`/api/education/calendar-day-types/${ty.code}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('save_failed'), 'error'); return }
    setTypes(prev => prev.map(x => (x.code === ty.code ? { ...x, ...body } : x)))
    onChanged()
  }

  const remove = async (ty: DayType) => {
    if (!(await confirmDialog({ message: t('confirm_delete_type').replace('{code}', ty.code), tone: 'danger' }))) return
    const res = await fetch(`/api/education/calendar-day-types/${ty.code}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { code?: string; error?: string }; toast(b.code === 'record_in_use' ? t('save_failed') : (b.error ?? t('save_failed')), 'error'); return }
    await load(); onChanged()
  }

  const inp: React.CSSProperties = { padding: '6px 9px', fontSize: 12.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }
  const chk = (checked: boolean, onChange: () => void, label: string) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />{label}
    </label>
  )

  return (
    <Modal onClose={onClose} maxWidth={560} closeOnBackdrop panelStyle={{ padding: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>{t('day_types_title')}</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('day_types_hint')}</p>

      {/* Новый тип */}
      <div style={{ display: 'grid', gap: 6, padding: 12, borderRadius: 10, background: 'var(--surface-2)', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('type_code_placeholder')} dir="ltr" style={{ ...inp, width: 130 }} />
          <input value={nameHe} onChange={e => setNameHe(e.target.value)} placeholder={t('type_name_he')} dir="rtl" style={{ ...inp, flex: 1, minWidth: 110 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={nameRu} onChange={e => setNameRu(e.target.value)} placeholder={t('type_name_ru')} style={{ ...inp, flex: 1, minWidth: 110 }} />
          <input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder={t('type_name_en')} dir="ltr" style={{ ...inp, flex: 1, minWidth: 110 }} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {chk(sec, () => setSec(v => !v), t('blocks_secular'))}
          {chk(kod, () => setKod(v => !v), t('blocks_kodesh'))}
          {chk(short, () => setShort(v => !v), t('is_shortened'))}
          <div style={{ flex: 1 }} />
          <button onClick={add} disabled={busy} style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>{t('add_type')}</button>
        </div>
      </div>

      {/* Существующие типы */}
      {loading ? <SkeletonRows avatar={false} rows={4} /> : (
        types.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{t('no_types')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {types.map(ty => (
              <div key={ty.code} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: ty.is_active ? 'var(--text)' : 'var(--text-faint)', minWidth: 120 }}>{tn(ty)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }} dir="ltr">{ty.code}</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {chk(ty.blocks_secular, () => patch(ty, { blocks_secular: !ty.blocks_secular }), t('blocks_secular'))}
                  {chk(ty.blocks_kodesh, () => patch(ty, { blocks_kodesh: !ty.blocks_kodesh }), t('blocks_kodesh'))}
                  {chk(ty.is_shortened, () => patch(ty, { is_shortened: !ty.is_shortened }), t('is_shortened'))}
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => patch(ty, { is_active: !ty.is_active })} style={{ fontSize: 12, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>{ty.is_active ? t('type_active') + ' ✓' : t('type_active')}</button>
                <button onClick={() => remove(ty)} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>{t('delete')}</button>
              </div>
            ))}
          </div>
        )
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>{t('close')}</button>
      </div>
    </Modal>
  )
}
