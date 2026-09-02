'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { PersonSelect } from '@/components/ui/person-select'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'

const accent = getModuleColor('education')

interface AlertType { code: string; name_he: string | null; name_ru: string | null; name_en: string | null; default_sensitive: boolean; is_active: boolean; sort_order: number }
interface Alert {
  id: string; student_id: string; type_code: string | null; severity: string; title: string | null; body: string | null
  state: string; is_sensitive: boolean; created_at: string
  student: { full_name: string | null; hebrew_name: string | null } | null
}

const STATES = ['new', 'in_progress', 'waiting', 'closed'] as const
const SEVERITIES = ['info', 'warning', 'critical'] as const

export default function AlertsClient() {
  const t = useTranslations('education.alerts')
  const { lang } = useLang()

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [types, setTypes] = useState<AlertType[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [fState, setFState] = useState('')
  const [fType, setFType] = useState('')
  const [fSeverity, setFSeverity] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [showTypes, setShowTypes] = useState(false)

  const typeName = (code: string | null): string => {
    if (!code) return '—'
    const ty = types.find(x => x.code === code)
    if (!ty) return code
    return (lang === 'he' ? ty.name_he : lang === 'en' ? ty.name_en : ty.name_ru) || ty.name_ru || code
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (fState) qs.set('state', fState); if (fType) qs.set('type_code', fType); if (fSeverity) qs.set('severity', fSeverity)
      const [aRes, tRes] = await Promise.all([
        fetch(`/api/education/alerts?${qs.toString()}`),
        fetch('/api/education/alert-types?active_only=false'),
      ])
      if (aRes.ok) { const b = await aRes.json(); setAlerts(b.alerts ?? []) }
      if (tRes.ok) { const b = await tRes.json(); setTypes(b.types ?? []) }
    } finally { setLoading(false) }
  }, [fState, fType, fSeverity])
  useEffect(() => { load() }, [load])

  const changeState = async (a: Alert, state: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/education/alerts/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      load()
    } finally { setBusy(false) }
  }

  const sevColor = (s: string) => s === 'critical' ? 'var(--danger)' : s === 'warning' ? 'var(--warn)' : 'var(--text-muted)'
  const inp: React.CSSProperties = { padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={fState} onChange={e => setFState(e.target.value)} style={inp}>
          <option value="">{t('all_states')}</option>
          {STATES.map(s => <option key={s} value={s}>{t(`state_${s}`)}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={inp}>
          <option value="">{t('all_types')}</option>
          {types.map(ty => <option key={ty.code} value={ty.code}>{typeName(ty.code)}</option>)}
        </select>
        <select value={fSeverity} onChange={e => setFSeverity(e.target.value)} style={inp}>
          <option value="">{t('all_severities')}</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{t(`severity_${s}`)}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowTypes(true)} style={{ ...inp, cursor: 'pointer', color: 'var(--text-muted)' }}>{t('manage_types')}</button>
        <button onClick={() => setShowCreate(true)} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>{t('new_alert')}</button>
      </div>

      {loading ? <SkeletonRows rows={5} /> : alerts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {alerts.map(a => (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12, opacity: a.state === 'closed' ? 0.62 : 1 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: sevColor(a.severity) }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.student?.hebrew_name || a.student?.full_name || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 999, padding: '2px 9px' }}>{typeName(a.type_code)}</span>
                {a.is_sensitive && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-tint)', borderRadius: 999, padding: '2px 8px' }}>{t('sensitive')}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t(`state_${a.state}`)}</span>
                <div style={{ flex: 1 }} />
                <select value={a.state} disabled={busy} onChange={e => changeState(a, e.target.value)} style={{ ...inp, fontSize: 12, padding: '4px 8px' }}>
                  {STATES.map(s => <option key={s} value={s}>{t(`state_${s}`)}</option>)}
                </select>
              </div>
              {(a.title || a.body) && (
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text)' }}>
                  {a.title && <div style={{ fontWeight: 600 }}>{a.title}</div>}
                  {a.body && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{a.body}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateAlertModal types={types} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} t={t} />}
      {showTypes && <TypesModal types={types} onClose={() => setShowTypes(false)} onChanged={load} t={t} />}
    </div>
  )
}

function CreateAlertModal({ types, onClose, onSaved, t }: { types: AlertType[]; onClose: () => void; onSaved: () => void; t: ReturnType<typeof useTranslations> }) {
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [typeCode, setTypeCode] = useState('')
  const [severity, setSeverity] = useState('info')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tn = (ty: AlertType) => (lang === 'he' ? ty.name_he : lang === 'en' ? ty.name_en : ty.name_ru) || ty.name_ru || ty.code

  const submit = async () => {
    if (!studentId) { setError(t('student_required')); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/education/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, type_code: typeCode || null, severity, title: title.trim() || null, body: body.trim() || null, is_sensitive: sensitive }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; setError(b.error ?? t('action_failed')); setSaving(false); return }
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : t('action_failed')); setSaving(false) }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' }

  return (
    <Modal onClose={onClose} maxWidth={460} closeOnBackdrop panelStyle={{ padding: 22, maxHeight: 'none', overflowY: 'visible' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: 'var(--text)' }}>{t('new_alert')}</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <div><label style={lbl}>{t('student')} *</label><PersonSelect value={studentId} onChange={id => setStudentId(id)} allowAdd={false} accentColor={accent} placeholder={t('choose_student')} /></div>
        <div><label style={lbl}>{t('type')}</label>
          <select value={typeCode} onChange={e => setTypeCode(e.target.value)} style={inp}>
            <option value="">—</option>
            {types.filter(x => x.is_active).map(ty => <option key={ty.code} value={ty.code}>{tn(ty)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>{t('severity')}</label>
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={inp}>
            {SEVERITIES.map(s => <option key={s} value={s}>{t(`severity_${s}`)}</option>)}
          </select>
        </div>
        <div><label style={lbl}>{t('title_field')}</label><input value={title} onChange={e => setTitle(e.target.value)} style={inp} dir="rtl" /></div>
        <div><label style={lbl}>{t('body_field')}</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} dir="rtl" /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)} />{t('mark_sensitive')}
        </label>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>{tCommon('cancel')}</button>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: 'pointer' }}>{saving ? tCommon('saving') : tCommon('create')}</button>
        </div>
      </div>
    </Modal>
  )
}

function TypesModal({ types, onClose, onChanged, t }: { types: AlertType[]; onClose: () => void; onChanged: () => void; t: ReturnType<typeof useTranslations> }) {
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [code, setCode] = useState('')
  const [nameHe, setNameHe] = useState('')
  const [busy, setBusy] = useState(false)
  const tn = (ty: AlertType) => (lang === 'he' ? ty.name_he : lang === 'en' ? ty.name_en : ty.name_ru) || ty.name_ru || ty.code

  const add = async () => {
    if (!/^[a-z0-9_]+$/.test(code.trim())) { toast(t('code_format'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/alert-types', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), name_he: nameHe.trim() || null, name_ru: nameHe.trim() || null, name_en: nameHe.trim() || null }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      setCode(''); setNameHe(''); onChanged()
    } finally { setBusy(false) }
  }
  const toggleActive = async (ty: AlertType) => {
    await fetch(`/api/education/alert-types/${ty.code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !ty.is_active }) })
    onChanged()
  }
  const remove = async (ty: AlertType) => {
    if (!(await confirmDialog({ message: t('confirm_delete_type').replace('{name}', tn(ty)), tone: 'danger' }))) return
    const res = await fetch(`/api/education/alert-types/${ty.code}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { code?: string; error?: string }; toast(b.code === 'record_in_use' ? t('type_in_use') : (b.error ?? t('action_failed')), 'error'); return }
    onChanged()
  }
  const inp: React.CSSProperties = { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <Modal onClose={onClose} maxWidth={440} closeOnBackdrop panelStyle={{ padding: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px', color: 'var(--text)' }}>{t('manage_types')}</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={nameHe} onChange={e => setNameHe(e.target.value)} placeholder={t('type_name')} dir="rtl" style={{ ...inp, flex: 1 }} />
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="code" dir="ltr" style={{ ...inp, width: 110 }} />
        <button onClick={add} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>{tCommon('create')}</button>
      </div>
      <div style={{ display: 'grid', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
        {types.map(ty => (
          <div key={ty.code} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <span style={{ flex: 1, fontSize: 13, color: ty.is_active ? 'var(--text)' : 'var(--text-faint)' }}>{tn(ty)}{ty.default_sensitive ? ' 🔒' : ''}</span>
            <button onClick={() => toggleActive(ty)} style={{ fontSize: 12, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>{ty.is_active ? t('deactivate') : t('activate')}</button>
            <button onClick={() => remove(ty)} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>{tCommon('delete')}</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>{tCommon('close')}</button>
      </div>
    </Modal>
  )
}
