'use client'

import { useCallback, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Case {
  id: string; journey_id: string; absence_date: string | null; note: string | null
  status: 'open' | 'in_handling' | 'resolved'; assigned_department_id: string | null
  student_name: string; department_name: string | null; opened_by_name: string | null
  handled_by_name: string | null; resolution: string | null; opened_at: string
}
type StatusFilter = 'open' | 'in_handling' | 'resolved' | 'all'
interface StudentOpt { journey_id: string; full_name: string }

export default function AbsencesClient() {
  const t = useTranslations('education.absences')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [items, setItems] = useState<Case[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [canManage, setCanManage] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Форма создания
  const [showForm, setShowForm] = useState(false)
  const [stuSearch, setStuSearch] = useState('')
  const [stuOpts, setStuOpts] = useState<StudentOpt[]>([])
  const [stu, setStu] = useState<StudentOpt | null>(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [formDept, setFormDept] = useState('')

  // Строчные действия
  const [transferFor, setTransferFor] = useState<string | null>(null)
  const [resolveFor, setResolveFor] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  const load = useCallback(async () => {
    const qs = filter === 'all' ? '' : `?status=${filter}`
    const d = await fetch(`/api/education/absences${qs}`).then(r => r.ok ? r.json() : null).catch(() => null)
    if (d) { setItems(d.items ?? []); setDepartments(d.departments ?? []); setCanManage(!!d.can_manage) }
    setLoaded(true)
  }, [filter])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!showForm) return
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/persons/students?pageSize=20&search=${encodeURIComponent(stuSearch)}`)
        if (r.ok) { const b = await r.json(); setStuOpts(b.students ?? []) }
      } catch { /* keep */ }
    }, 250)
    return () => clearTimeout(h)
  }, [stuSearch, showForm])

  async function create() {
    if (!stu) return
    setBusy('create')
    try {
      const res = await fetch('/api/education/absences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: stu.journey_id, absence_date: date || null, note: note.trim() || null, department_id: formDept || null }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error || t('create_failed'), 'error'); return }
      setShowForm(false); setStu(null); setStuSearch(''); setDate(''); setNote(''); setFormDept('')
      await load()
    } finally { setBusy(null) }
  }

  async function patch(id: string, body: Record<string, unknown>, okMsg?: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/education/absences/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error || t('action_failed'), 'error'); return }
      if (okMsg) toast(okMsg, 'info')
      setTransferFor(null); setResolveFor(null); setResolution('')
      await load()
    } finally { setBusy(null) }
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    const loc = intlLocale(lang)
    return new Date(iso + (iso.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString(loc, { day: '2-digit', month: 'short' })
  }
  const statusChip = (s: Case['status']) => {
    const map = { open: { bg: 'rgba(234,179,8,0.14)', fg: 'var(--warn)' }, in_handling: { bg: 'rgba(13,148,136,0.14)', fg: 'var(--accent-strong)' }, resolved: { bg: 'rgba(16,185,129,0.14)', fg: 'var(--success)' } }[s]
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: map.bg, color: map.fg }}>{t(`status_${s}`)}</span>
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }
  // box-sizing:border-box + minWidth:0 обязательны: иначе input с width:100% плюс
  // padding/border вылезал за край карточки на узком экране (форма «уезжала» влево).
  const inp: React.CSSProperties = { padding: '8px 11px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', minWidth: 0, maxWidth: '100%' }
  const smallBtn = (primary?: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: primary ? 'none' : '1px solid var(--border)', cursor: 'pointer', background: primary ? 'var(--accent)' : 'var(--surface)', color: primary ? '#fff' : 'var(--text-muted)' })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <ModuleHeader
        module="education"
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<>
          {canManage && (
            <button onClick={() => setShowForm(s => !s)} style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              {showForm ? t('cancel') : t('new_case')}
            </button>
          )}
        </>}
      />

      {/* Создание */}
      {showForm && canManage && (
        <div style={{ ...card, display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input value={stu ? stu.full_name : stuSearch} onChange={e => { setStu(null); setStuSearch(e.target.value) }} placeholder={t('pick_student')} style={{ ...inp, width: '100%' }} />
            {!stu && stuSearch && stuOpts.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 10, top: '100%', insetInlineStart: 0, insetInlineEnd: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
                {stuOpts.map(o => (
                  <div key={o.journey_id} role="button" tabIndex={0} onClick={() => { setStu(o); setStuSearch('') }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault(); setStu(o); setStuSearch('') } }} style={{ padding: '8px 11px', fontSize: 13, cursor: 'pointer' }}>{o.full_name}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
            <select value={formDept} onChange={e => setFormDept(e.target.value)} style={{ ...inp, minWidth: 200 }}>
              <option value="">{t('no_transfer')}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{t('transfer_to')}: {localizedDeptName(d, lang)}</option>)}
            </select>
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('note_ph')} rows={2} style={{ ...inp, resize: 'vertical' }} />
          <SubmitButton onClick={create} loading={busy === 'create'} disabled={!stu || busy === 'create'} style={{ ...smallBtn(true), justifySelf: 'start', padding: '8px 18px' }}>{t('open_case')}</SubmitButton>
        </div>
      )}

      {/* Фильтр статуса */}
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 8, width: 'fit-content' }}>
        {(['open', 'in_handling', 'resolved', 'all'] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: filter === s ? 'var(--surface)' : 'transparent', color: filter === s ? 'var(--text)' : 'var(--text-muted)' }}>
            {t(`filter_${s}`)}
          </button>
        ))}
      </div>

      {!loaded ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(c => (
            <div key={c.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.student_name || '—'}</span>
                {statusChip(c.status)}
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(c.absence_date || c.opened_at)}</span>
                {c.department_name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {t('at_dept')}: {c.department_name}</span>}
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                  {c.status !== 'resolved' && <SubmitButton onClick={() => { setTransferFor(transferFor === c.id ? null : c.id); setResolveFor(null) }} loading={busy === c.id} style={smallBtn()}>{t('transfer')}</SubmitButton>}
                  {c.status !== 'resolved' && <SubmitButton onClick={() => { setResolveFor(resolveFor === c.id ? null : c.id); setTransferFor(null) }} loading={busy === c.id} style={smallBtn(true)}>{t('resolve')}</SubmitButton>}
                  {c.status === 'resolved' && <SubmitButton onClick={() => patch(c.id, { status: 'in_handling' })} loading={busy === c.id} style={smallBtn()}>{t('reopen')}</SubmitButton>}
                </div>
              </div>
              {c.note && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{c.note}</div>}
              {c.status === 'resolved' && c.resolution && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, borderInlineStart: '2px solid var(--surface-2)', paddingInlineStart: 8 }}><b>{t('resolution')}:</b> {c.resolution}</div>}

              {transferFor === c.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select id={`t-${c.id}`} defaultValue="" style={{ ...inp, minWidth: 200 }}>
                    <option value="" disabled>{t('choose_dept')}</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
                  </select>
                  <button onClick={() => { const el = document.getElementById(`t-${c.id}`) as HTMLSelectElement | null; if (el?.value) patch(c.id, { department_id: el.value }, t('transferred')) }} style={smallBtn(true)}>{t('do_transfer')}</button>
                </div>
              )}
              {resolveFor === c.id && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder={t('resolution_ph')} rows={2} style={{ ...inp, resize: 'vertical' }} />
                  <button onClick={() => patch(c.id, { status: 'resolved', resolution })} style={{ ...smallBtn(true), justifySelf: 'start' }}>{t('do_resolve')}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
