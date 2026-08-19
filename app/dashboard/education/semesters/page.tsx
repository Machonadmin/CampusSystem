'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient, getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Semester {
  id: string
  year_label: string
  term_number: number
  name: string | null
  status: 'open' | 'closed'
  created_at: string
}

/**
 * Открытие семестров — учебное действие (владелец: «סמסטר פותחים בלימודים»).
 * Цену/долги/студенток показывают финансы; здесь — только учебная часть.
 */
export default function EducationSemestersPage() {
  const t = useTranslations('education.semesters')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const primary = getModuleColor('education', 'primary')

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(true)

  const [creating, setCreating] = useState(false)
  const [fYear, setFYear] = useState('')
  const [fTerm, setFTerm] = useState('')
  const [fName, setFName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/education/semesters')
      if (res.status === 403) { setCanManage(false); setErr(t('forbidden')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_failed')); return }
      const b = await res.json()
      setSemesters(b.semesters ?? [])
    } catch { setErr(t('load_failed')) } finally { setLoading(false) }
  }, [t])
  useEffect(() => { load() }, [load])

  async function createSemester() {
    if (!fYear.trim() || !fTerm.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/education/semesters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_label: fYear.trim(), term_number: Number(fTerm), name: fName.trim() || null }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast(b.error ?? t('save_failed'), 'error'); return }
      setCreating(false); setFYear(''); setFTerm(''); setFName('')
      await load()
    } catch { toast(t('save_failed'), 'error') } finally { setSaving(false) }
  }

  async function toggleStatus(s: Semester) {
    const status = s.status === 'open' ? 'closed' : 'open'
    const res = await fetch(`/api/education/semesters/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
    setSemesters(prev => prev.map(x => x.id === s.id ? { ...x, status } : x))
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setCreating(v => !v)} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: 'var(--surface)', color: primary, cursor: 'pointer' }}>
            {creating ? tCommon('cancel') : t('open_semester')}
          </button>
        )}
      </div>

      {creating && canManage && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('f_year')}</span>
            <input style={{ ...inp, width: 130 }} value={fYear} onChange={e => setFYear(e.target.value)} placeholder={t('f_year_ph')} />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('f_term')}</span>
            <input style={{ ...inp, width: 90 }} type="number" min="1" value={fTerm} onChange={e => setFTerm(e.target.value)} placeholder="1" />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('f_name')}</span>
            <input style={{ ...inp, width: 200 }} value={fName} onChange={e => setFName(e.target.value)} placeholder={t('f_name_ph')} />
          </label>
          <button onClick={createSemester} disabled={saving || !fYear.trim() || !fTerm.trim()} style={{ fontSize: 13, fontWeight: 600, padding: '9px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving || !fYear.trim() || !fTerm.trim() ? 0.6 : 1 }}>{tCommon('save')}</button>
        </div>
      )}

      {err && <div style={{ fontSize: 13, color: 'var(--danger, #DC2626)' }}>{err}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : semesters.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {semesters.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, opacity: s.status === 'closed' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name || `${s.year_label} · ${t('term_n').replace('{n}', String(s.term_number))}`}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.status === 'open' ? '#D1FAE5' : 'var(--surface-2)', color: s.status === 'open' ? '#065F46' : 'var(--text-muted)' }}>
                  {t(`status_${s.status}`)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.year_label} · {t('term_n').replace('{n}', String(s.term_number))}</div>
              {canManage && (
                <div style={{ marginTop: 14 }}>
                  <button onClick={() => toggleStatus(s)} style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                    {s.status === 'open' ? t('close') : t('reopen')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t('hint')}</div>}
    </div>
  )
}
