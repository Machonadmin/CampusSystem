'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Enrollment {
  id: string
  journey_id: string
  enrolled_from: string
  enrolled_to: string | null
  status: 'active' | 'ended'
  student_name: string
  student_hebrew_name: string | null
}
interface StudentHit {
  journey_id: string
  full_name: string
  hebrew_name: string | null
  plan: { plan_id: string | null; plan_name: string | null } | null
}
interface Dietary {
  restrictions: string | null
  allergies: string | null
  notes: string | null
}

interface Props {
  planId: string
  planName: string
  canManage: boolean
}

export default function FoodPlanDetailClient({ planId, planName, canManage }: Props) {
  const t = useTranslations('food')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('food', 'primary')
  const light = getModuleColor('food', 'light')

  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  // enroll form
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [picked, setPicked] = useState<StudentHit | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // dietary editor
  const [dietFor, setDietFor] = useState<Enrollment | null>(null)
  const [diet, setDiet] = useState<Dietary>({ restrictions: '', allergies: '', notes: '' })
  const [dietBusy, setDietBusy] = useState(false)
  const [dietError, setDietError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/food/plans/${planId}/enrollments`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setEnrollments([]); return
      }
      const b = await res.json()
      setEnrollments(b.enrollments ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [planId, t])

  useEffect(() => { load() }, [load])

  // student search for the picker
  useEffect(() => {
    if (!canManage || picked) return
    const q = query.trim()
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/food/students${q ? `?search=${encodeURIComponent(q)}` : ''}`)
        if (!res.ok) return
        const b = await res.json()
        if (!cancelled) setHits((b.students ?? []).slice(0, 8))
      } catch { /* ignore */ }
    }
    run()
    return () => { cancelled = true }
  }, [query, picked, canManage])

  async function enroll() {
    if (!picked || !from) { setPanelError(t('form.required')); return }
    setBusy(true); setPanelError(null)
    try {
      const res = await fetch(`/api/food/plans/${planId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: picked.journey_id, enrolled_from: from, enrolled_to: to || null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setPanelError(b.error ?? t('plan.enroll_error')); return
      }
      setPicked(null); setQuery(''); setFrom(''); setTo('')
      await load()
    } catch {
      setPanelError(t('plan.enroll_error'))
    } finally {
      setBusy(false)
    }
  }

  async function endEnrollment(e: Enrollment) {
    if (!confirm(t('plan.end_confirm'))) return
    setBusy(true); setPanelError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/food/enrollments/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', enrolled_to: e.enrolled_to ?? today }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setPanelError(b.error ?? t('plan.action_error')); return
      }
      await load()
    } catch {
      setPanelError(t('plan.action_error'))
    } finally {
      setBusy(false)
    }
  }

  async function openDiet(e: Enrollment) {
    setDietFor(e); setDietError(null)
    setDiet({ restrictions: '', allergies: '', notes: '' })
    try {
      const res = await fetch(`/api/food/journeys/${e.journey_id}/dietary`)
      if (res.ok) {
        const b = await res.json()
        if (b.dietary) setDiet({
          restrictions: b.dietary.restrictions ?? '',
          allergies: b.dietary.allergies ?? '',
          notes: b.dietary.notes ?? '',
        })
      }
    } catch { /* ignore — empty editor */ }
  }

  async function saveDiet() {
    if (!dietFor) return
    setDietBusy(true); setDietError(null)
    try {
      const res = await fetch(`/api/food/journeys/${dietFor.journey_id}/dietary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diet),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setDietError(b.error ?? t('dietary.save_error')); return
      }
      setDietFor(null)
    } catch {
      setDietError(t('dietary.save_error'))
    } finally {
      setDietBusy(false)
    }
  }

  const activeShown = enrollments.filter(e => e.status === 'active').length

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('food'), href: '/dashboard/food' },
        { label: planName || '—' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('food'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(217,119,6,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{planName}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('list.enrolled')}: {activeShown}</div>
        </div>
        <Link href="/dashboard/food" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {panelError && <div style={{ fontSize: 13, color: '#DC2626' }}>{panelError}</div>}

      {/* Enroll panel */}
      {canManage && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{t('plan.enroll_student')}</div>
          {picked ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: primary, background: light, padding: '6px 10px', borderRadius: 8 }}>
                {picked.full_name || picked.hebrew_name || picked.journey_id}
                <button onClick={() => setPicked(null)} style={{ background: 'none', border: 'none', color: primary, cursor: 'pointer', marginInlineStart: 6 }}>✕</button>
              </span>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp(150)} />
              <input type="date" value={to} onChange={e => setTo(e.target.value)} placeholder={t('form.to')} style={inp(150)} />
              <button onClick={enroll} disabled={busy} style={btn(primary)}>{t('plan.enroll')}</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('plan.search_student')} style={inp(320)} />
              {hits.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, marginTop: 4, width: 320, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {hits.map(h => (
                    <div
                      key={h.journey_id}
                      onClick={() => { setPicked(h); setHits([]) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F3F4F6' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#F9FAFB' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fff' }}
                    >
                      <div style={{ fontWeight: 500, color: '#1F2937' }}>{h.full_name || h.hebrew_name || '—'}</div>
                      <div style={{ fontSize: 11, color: h.plan ? '#D97706' : '#9CA3AF' }}>
                        {h.plan ? h.plan.plan_name ?? '' : t('plan.no_plan')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Enrolled students */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('plan.enrolled_section')}</h2>
        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
        ) : enrollments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('plan.no_enrollments')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t('plan.student'), t('form.from'), t('form.to'), t('plan.status'), ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => (
                  <tr key={e.id}>
                    <td style={td}>{e.student_name || e.student_hebrew_name || '—'}</td>
                    <td style={td}>{e.enrolled_from}</td>
                    <td style={td}>{e.enrolled_to || '—'}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                        background: e.status === 'active' ? light : '#F3F4F6',
                        color: e.status === 'active' ? '#B45309' : '#6B7280',
                      }}>
                        {t(`status.${e.status}`)}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && (
                        <button onClick={() => openDiet(e)} disabled={busy} style={linkBtn('#6B7280')}>{t('dietary.edit')}</button>
                      )}
                      {canManage && e.status === 'active' && (
                        <button onClick={() => endEnrollment(e)} disabled={busy} style={linkBtn('#D97706')}>{t('plan.end_enrollment')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dietary editor */}
      {dietFor && (
        <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>
              {t('dietary.title')} · {dietFor.student_name || dietFor.student_hebrew_name || '—'}
            </h3>
            <button onClick={() => setDietFor(null)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
          {dietError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{dietError}</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={fieldLabel}>{t('dietary.restrictions')}
              <textarea value={diet.restrictions ?? ''} onChange={e => setDiet(d => ({ ...d, restrictions: e.target.value }))} rows={2} style={area} />
            </label>
            <label style={fieldLabel}>{t('dietary.allergies')}
              <textarea value={diet.allergies ?? ''} onChange={e => setDiet(d => ({ ...d, allergies: e.target.value }))} rows={2} style={area} />
            </label>
            <label style={fieldLabel}>{t('dietary.notes')}
              <textarea value={diet.notes ?? ''} onChange={e => setDiet(d => ({ ...d, notes: e.target.value }))} rows={2} style={area} />
            </label>
            <div>
              <button onClick={saveDiet} disabled={dietBusy} style={btn(primary)}>{tCommon('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'start', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'grid', gap: 4 }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', resize: 'vertical', fontFamily: 'inherit' }

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function linkBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '2px 6px' }
}
