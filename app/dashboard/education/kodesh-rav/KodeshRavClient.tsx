'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'

const accent = getModuleColor('education')

interface PersonRef { id: string; full_name: string | null; hebrew_name: string | null }
interface Approval {
  id: string
  status: string
  note: string | null
  teacher: PersonRef | null
  course: { id: string; name: string; name_he: string | null } | null
}
interface Quota {
  teacher_id: string
  name: string
  quota_id: string | null
  approved_hours: number | null
  source: string | null
  term_number: number | null
  assigned_hours: number
  remaining: number | null
  over: boolean
}

function pname(p: PersonRef | null): string { return p?.hebrew_name || p?.full_name || '—' }

export default function KodeshRavClient() {
  const t = useTranslations('education.kodesh_rav')
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [quotas, setQuotas] = useState<Quota[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [year, setYear] = useState('')

  // Инлайн-редактирование квоты.
  const [editTeacher, setEditTeacher] = useState<string | null>(null)
  const [editHours, setEditHours] = useState('')
  const [editSource, setEditSource] = useState<'contract' | 'manual'>('contract')

  const load = useCallback(async (yr: string) => {
    setLoading(true)
    try {
      const [aRes, qRes] = await Promise.all([
        fetch('/api/education/teacher-approvals?status=proposed'),
        fetch(`/api/education/teacher-quotas${yr ? `?year=${encodeURIComponent(yr)}` : ''}`),
      ])
      if (aRes.ok) { const b = await aRes.json(); setApprovals(b.approvals ?? []) }
      if (qRes.ok) { const b = await qRes.json(); setQuotas(b.quotas ?? []) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(year) }, [load, year])

  const decide = async (id: string, status: 'approved' | 'rejected' | 'info_requested') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/education/teacher-approvals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      load(year)
    } finally { setBusy(false) }
  }

  const startEdit = (q: Quota) => {
    setEditTeacher(q.teacher_id)
    setEditHours(q.approved_hours !== null ? String(q.approved_hours) : '')
    setEditSource((q.source as 'contract' | 'manual') ?? 'contract')
  }

  const saveQuota = async (q: Quota) => {
    if (!year.trim()) { toast(t('year_required'), 'error'); return }
    const hours = Number(editHours)
    if (!(hours >= 0)) { toast(t('hours_invalid'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/education/teacher-quotas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: q.teacher_id, year_label: year.trim(), approved_hours: hours, source: editSource }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      setEditTeacher(null)
      load(year)
    } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 600, color: 'var(--text)', textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 12px', color: 'var(--text)' }
  const inp: React.CSSProperties = { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }
  const btn = (bg: string): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' })

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Очередь утверждений */}
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('approvals_title')}</h3>
        {loading ? <SkeletonRows avatar={false} rows={3} /> : approvals.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('approvals_empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface-2)' }}>
                <th style={th}>{t('teacher')}</th><th style={th}>{t('course')}</th><th style={th}>{t('note')}</th><th style={{ ...th, width: 260 }}>{t('decision')}</th>
              </tr></thead>
              <tbody>
                {approvals.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                    <td style={td}>{pname(a.teacher)}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{a.course?.name_he || a.course?.name || '—'}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{a.note || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={busy} onClick={() => decide(a.id, 'approved')} style={btn('var(--success)')}>{t('approve')}</button>
                        <button disabled={busy} onClick={() => decide(a.id, 'rejected')} style={btn('var(--danger)')}>{t('reject')}</button>
                        <button disabled={busy} onClick={() => decide(a.id, 'info_requested')} style={{ ...btn('var(--surface)'), color: 'var(--text)', border: '1px solid var(--border-strong)' }}>{t('request_info')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Квоты */}
      <section style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('quotas_title')}</h3>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {t('year_label')}
            <input value={year} onChange={e => setYear(e.target.value)} placeholder="תשפ״ז" dir="rtl" style={{ ...inp, width: 120 }} />
          </label>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('quotas_hint')}</p>
        {loading ? <SkeletonRows avatar={false} rows={4} /> : quotas.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('quotas_empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface-2)' }}>
                <th style={th}>{t('teacher')}</th><th style={{ ...th, textAlign: 'center' }}>{t('approved')}</th>
                <th style={{ ...th, textAlign: 'center' }}>{t('assigned')}</th><th style={{ ...th, textAlign: 'center' }}>{t('remaining')}</th>
                <th style={th}>{t('source')}</th><th style={{ ...th, width: 180 }}></th>
              </tr></thead>
              <tbody>
                {quotas.map(q => (
                  <tr key={q.teacher_id} style={{ borderTop: '1px solid var(--surface-2)', background: q.over ? 'var(--warn-tint)' : undefined }}>
                    <td style={td}>{q.name}</td>
                    {editTeacher === q.teacher_id ? (
                      <>
                        <td style={{ ...td, textAlign: 'center' }}><input value={editHours} onChange={e => setEditHours(e.target.value)} type="number" min={0} style={{ ...inp, width: 72 }} /></td>
                        <td style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{q.assigned_hours}</td>
                        <td style={{ ...td, textAlign: 'center' }}>—</td>
                        <td style={td}>
                          <select value={editSource} onChange={e => setEditSource(e.target.value as 'contract' | 'manual')} style={inp}>
                            <option value="contract">{t('source_contract')}</option>
                            <option value="manual">{t('source_manual')}</option>
                          </select>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button disabled={busy} onClick={() => saveQuota(q)} style={btn(accent)}>{t('save')}</button>
                            <button disabled={busy} onClick={() => setEditTeacher(null)} style={{ ...btn('var(--surface)'), color: 'var(--text-faint)', border: '1px solid var(--border-strong)' }}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{q.approved_hours ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{q.assigned_hours}</td>
                        <td style={{ ...td, textAlign: 'center', color: q.over ? 'var(--warn)' : 'var(--text)', fontWeight: q.over ? 700 : 400 }}>
                          {q.remaining ?? '—'}{q.over ? ` · ${t('over')}` : ''}
                        </td>
                        <td style={{ ...td, color: 'var(--text-muted)' }}>{q.source ? t(`source_${q.source}`) : '—'}</td>
                        <td style={td}><button onClick={() => startEdit(q)} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>{t('set_quota')}</button></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
