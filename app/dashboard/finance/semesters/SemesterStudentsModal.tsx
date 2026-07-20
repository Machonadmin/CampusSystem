'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Enrollment {
  journey_id: string
  name: string
  charge_id: string | null
  amount: number | null
  charge_status: string | null
}
interface StudentOption { journey_id: string; name: string }

/**
 * Модалка «Студентки семестра»: менеджер назначает КОНКРЕТНЫХ студенток на
 * семестр (создаёт счёт) и снимает (отменяет счёт). Решение владельца:
 * начисляем не всем активным, а поимённо. Список студенток — из /api/finance/students.
 */
export default function SemesterStudentsModal({ semesterId, title, onClose }: {
  semesterId: string
  title: string
  onClose: () => void
}) {
  const t = useTranslations('finance.semesters')
  const tCommon = useTranslations('common')
  const primary = getModuleColor('finance', 'primary')

  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const [students, setStudents] = useState<StudentOption[]>([])
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<StudentOption[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/semesters/${semesterId}/enrollments`)
      if (!res.ok) { setEnrollments([]); return }
      const b = await res.json()
      setEnrollments(b?.enrollments ?? [])
    } catch { setEnrollments([]) }
    finally { setLoaded(true) }
  }, [semesterId])

  useEffect(() => { load() }, [load])

  // Список студенток для пикера (ленивая подгрузка при первом поиске).
  useEffect(() => {
    if (students.length > 0) return
    fetch('/api/finance/students')
      .then(r => r.ok ? r.json() : null)
      .then(b => {
        const list = (b?.students ?? []) as Array<{ journey_id: string; full_name?: string; hebrew_name?: string | null }>
        setStudents(list.map(s => ({ journey_id: s.journey_id, name: (s.full_name || s.hebrew_name || '').trim() })))
      })
      .catch(() => {/* ignore */})
  }, [students.length])

  const enrolledIds = useMemo(() => new Set(enrollments.map(e => e.journey_id)), [enrollments])
  const pickedIds = useMemo(() => new Set(picked.map(p => p.journey_id)), [picked])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return students
      .filter(s => !enrolledIds.has(s.journey_id) && !pickedIds.has(s.journey_id))
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 30)
  }, [students, search, enrolledIds, pickedIds])

  async function assign() {
    if (picked.length === 0 || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/finance/semesters/${semesterId}/enrollments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_ids: picked.map(p => p.journey_id) }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast(b.error ?? t('save_failed'), 'error'); return }
      toast(t('enroll_result').replace('{created}', String(b.created ?? 0)).replace('{skipped}', String(b.skipped ?? 0)), 'success')
      setPicked([]); setSearch('')
      await load()
    } catch { toast(t('save_failed'), 'error') }
    finally { setBusy(false) }
  }

  async function remove(journeyId: string) {
    if (!window.confirm(t('unenroll_confirm'))) return
    try {
      const res = await fetch(`/api/finance/semesters/${semesterId}/enrollments/${journeyId}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
      await load()
    } catch { toast(t('save_failed'), 'error') }
  }

  const fmtMoney = (n: number | null) => n == null ? '' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const inp: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)',
    borderRadius: 8, color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 100, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('students_title')}</h2>
          <button onClick={onClose} style={{ fontSize: 18, lineHeight: 1, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>{title}</div>

        {/* Add students */}
        {picked.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {picked.map(p => (
              <button key={p.journey_id} onClick={() => setPicked(prev => prev.filter(x => x.journey_id !== p.journey_id))}
                style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: getModuleColor('finance', 'light'), color: primary, border: `1px solid ${getModuleColor('finance', 'medium')}`, cursor: 'pointer' }}>
                {p.name || p.journey_id} ×
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_student')} style={{ ...inp, flex: 1 }} />
          <button onClick={assign} disabled={picked.length === 0 || busy}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', whiteSpace: 'nowrap', cursor: (picked.length === 0 || busy) ? 'default' : 'pointer', opacity: (picked.length === 0 || busy) ? 0.5 : 1 }}>
            {t('enroll')}
          </button>
        </div>
        {filtered.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4, border: '1px solid var(--border)', borderRadius: 8, padding: 6 }}>
            {filtered.map(s => (
              <button key={s.journey_id} onClick={() => { setPicked(prev => [...prev, s]); setSearch('') }}
                style={{ textAlign: 'start', fontSize: 13, padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                {s.name || s.journey_id}
              </button>
            ))}
          </div>
        )}

        {/* Enrolled list */}
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            {t('enrolled_count').replace('{n}', String(enrollments.length))}
          </div>
          {!loaded ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
          ) : enrollments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_enrollments')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {enrollments.map(e => (
                <div key={e.journey_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, opacity: e.charge_status === 'cancelled' ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{e.name || e.journey_id}</span>
                    {e.amount != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtMoney(e.amount)}{e.charge_status === 'cancelled' ? ` · ${t('charge_cancelled')}` : ''}
                      </span>
                    )}
                  </div>
                  <button onClick={() => remove(e.journey_id)} title={t('unenroll')}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger,#DC2626)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                    × {t('unenroll')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
