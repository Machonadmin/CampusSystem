'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useSidebar } from '@/lib/sidebar/SidebarContext'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type QType = 'scale_1_5' | 'number' | 'text_short' | 'text_long' | 'yes_no_partial'
type AVal = number | string | null
interface AEntry { value: AVal; comment?: string }
type Answers = Record<string, AEntry>

interface TQ { id: string; text: string; type: QType; required?: boolean; maps_to?: string }
interface TB { id: string; title: string; type?: string; questions?: TQ[] }

interface CheckFull {
  id: string; template_id: string | null
  lesson_date: string; lesson_time: string
  teacher_name: string | null; observer_name: string | null
  group_name: string | null; course_name: string | null
  status: string
  answers: Answers | null
  strengths: string | null; areas_for_improvement: string | null
  action_item: string | null; overall_rating: number | null
  teacher_feedback: string | null; started_on_time: boolean | null
  delay_minutes: number | null; delay_reason: string | null
  technical_issues: string | null
}
interface TData { id: string; name: string; structure: { blocks: TB[] } }

// ── Atom inputs ───────────────────────────────────────────────────────────────

function ScaleInput({ value, onChange, disabled, err }: {
  value: number | null; onChange: (v: number) => void; disabled?: boolean; err?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)}
          style={{
            width: 44, height: 44, borderRadius: 8, fontSize: 15, fontWeight: 700,
            border: `2px solid ${value === n ? '#BE185D' : err ? '#FCA5A5' : '#E5E7EB'}`,
            backgroundColor: value === n ? '#BE185D' : '#fff',
            color: value === n ? '#fff' : '#374151',
            cursor: disabled ? 'default' : 'pointer', transition: 'all 0.1s',
          }}
        >{n}</button>
      ))}
    </div>
  )
}

function YNPInput({ value, onChange, disabled, err }: {
  value: string | null; onChange: (v: string) => void; disabled?: boolean; err?: boolean
}) {
  const t = useTranslations('quality')
  const opts = [
    { v: 'yes',     l: t('fill.option_yes'),     c: '#16A34A', bg: '#F0FDF4' },
    { v: 'no',      l: t('fill.option_no'),      c: '#DC2626', bg: '#FEF2F2' },
    { v: 'partial', l: t('fill.option_partial'), c: '#D97706', bg: '#FFFBEB' },
  ] as const
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opts.map(o => {
        const sel = value === o.v
        return (
          <button key={o.v} type="button" disabled={disabled} onClick={() => onChange(o.v)}
            style={{
              padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: `2px solid ${sel ? o.c : err ? '#FCA5A5' : '#E5E7EB'}`,
              backgroundColor: sel ? o.bg : '#fff', color: sel ? o.c : '#374151',
              cursor: disabled ? 'default' : 'pointer', transition: 'all 0.1s',
            }}
          >{o.l}</button>
        )
      })}
    </div>
  )
}

// ── Question row ──────────────────────────────────────────────────────────────

function QuestionRow({ q, entry, onChange, disabled, err }: {
  q: TQ; entry: AEntry; onChange: (e: AEntry) => void; disabled?: boolean; err?: boolean
}) {
  const t = useTranslations('quality')
  const [commentOpen, setCommentOpen] = useState(!!entry.comment)
  const val = entry.value
  const comment = entry.comment ?? ''

  const updateVal = (v: AVal) => onChange({ value: v, comment: entry.comment })
  const updateComment = (c: string) => onChange({ value: entry.value, comment: c })

  const inputEl = () => {
    switch (q.type) {
      case 'scale_1_5':
        return <ScaleInput value={typeof val === 'number' ? val : null} onChange={updateVal} disabled={disabled} err={err} />
      case 'yes_no_partial':
        return <YNPInput value={typeof val === 'string' ? val : null} onChange={updateVal} disabled={disabled} err={err} />
      case 'number':
        return (
          <input type="number" value={typeof val === 'number' ? val : ''} disabled={disabled}
            onChange={e => updateVal(e.target.value !== '' ? Number(e.target.value) : null)}
            style={{ width: 110, padding: '8px 10px', fontSize: 13, border: `1px solid ${err ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6, outline: 'none' }} />
        )
      case 'text_short':
        return (
          <input type="text" value={typeof val === 'string' ? val : ''} disabled={disabled}
            placeholder={t('fill.answer_placeholder_short')}
            onChange={e => updateVal(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${err ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box', backgroundColor: disabled ? '#F9FAFB' : '#fff' }} />
        )
      case 'text_long':
        return (
          <textarea value={typeof val === 'string' ? val : ''} disabled={disabled} rows={3}
            placeholder={t('fill.answer_placeholder_long')}
            onChange={e => updateVal(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${err ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6, outline: 'none', resize: 'vertical', boxSizing: 'border-box', backgroundColor: disabled ? '#F9FAFB' : '#fff' }} />
        )
    }
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, flex: 1 }}>
          {q.text}
          {q.required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
        </span>
        {!disabled && (
          <button type="button" onClick={() => setCommentOpen(o => !o)} title={t('fill.add_comment_title')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 4, color: entry.comment ? '#3B82F6' : '#D1D5DB', flexShrink: 0, transition: 'color 0.15s' }}>
            💬
          </button>
        )}
      </div>

      {inputEl()}

      {err && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{t('fill.required_field')}</p>}

      {(commentOpen || (disabled && entry.comment)) && (
        <textarea value={comment} disabled={disabled} rows={2}
          placeholder={t('fill.comment_placeholder')}
          onChange={e => updateComment(e.target.value)}
          style={{ marginTop: 8, width: '100%', padding: '7px 10px', fontSize: 12, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 6, outline: 'none', resize: 'vertical', backgroundColor: '#F9FAFB', boxSizing: 'border-box' }} />
      )}
    </div>
  )
}

// ── Block card wrapper ────────────────────────────────────────────────────────

function BlockCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

// ── Status constants ──────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, [string, string]> = {
  planned:     ['#EFF6FF', '#3B82F6'],
  in_progress: ['#FFFBEB', '#D97706'],
  completed:   ['#F0FDF4', '#16A34A'],
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FillCheckPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('quality')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const { isOpen, isMobile } = useSidebar()
  const footerLeft = isMobile ? 0 : isOpen ? 240 : 56

  const [check, setCheck] = useState<CheckFull | null>(null)
  const [tmpl, setTmpl] = useState<TData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [errs, setErrs] = useState<Record<string, boolean>>({})

  // ── Form state ──
  const [answers, setAnswers] = useState<Answers>({})
  const [startedOnTime, setStartedOnTime] = useState(true)
  const [delayMin, setDelayMin] = useState<number | null>(null)
  const [delayReason, setDelayReason] = useState('')
  const [techIssues, setTechIssues] = useState('')
  const [strengths, setStrengths] = useState('')
  const [areas, setAreas] = useState('')
  const [actionItem, setActionItem] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')

  // ── Load ──
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/quality-control/${id}`)
        if (!res.ok) return
        const c: CheckFull = await res.json()
        setCheck(c)
        setAnswers((c.answers ?? {}) as Answers)
        setStartedOnTime(c.started_on_time ?? true)
        setDelayMin(c.delay_minutes)
        setDelayReason(c.delay_reason ?? '')
        setTechIssues(c.technical_issues ?? '')
        setStrengths(c.strengths ?? '')
        setAreas(c.areas_for_improvement ?? '')
        setActionItem(c.action_item ?? '')
        setRating(c.overall_rating)
        setFeedback(c.teacher_feedback ?? '')
        if (c.template_id) {
          const tr = await fetch(`/api/settings/quality-templates/${c.template_id}`)
          if (tr.ok) setTmpl(await tr.json())
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const isRO = check?.status === 'completed'

  // ── Answer helpers ──
  function getEntry(q: TQ): AEntry {
    const comment = answers[q.id]?.comment
    if (q.maps_to === 'strengths') return { value: strengths, comment }
    if (q.maps_to === 'areas_for_improvement') return { value: areas, comment }
    if (q.maps_to === 'action_item') return { value: actionItem, comment }
    if (q.maps_to === 'overall_rating') return { value: rating, comment }
    if (q.maps_to === 'teacher_feedback') return { value: feedback, comment }
    return answers[q.id] ?? { value: null }
  }

  function setEntry(q: TQ, e: AEntry) {
    if (q.maps_to) {
      // Store comment in answers, value in dedicated state
      setAnswers(prev => ({ ...prev, [q.id]: { value: null, comment: e.comment } }))
      if (q.maps_to === 'strengths') setStrengths((e.value as string) || '')
      else if (q.maps_to === 'areas_for_improvement') setAreas((e.value as string) || '')
      else if (q.maps_to === 'action_item') setActionItem((e.value as string) || '')
      else if (q.maps_to === 'overall_rating') setRating(typeof e.value === 'number' ? e.value : null)
      else if (q.maps_to === 'teacher_feedback') setFeedback((e.value as string) || '')
    } else {
      setAnswers(prev => ({ ...prev, [q.id]: e }))
    }
  }

  // ── Validation ──
  function validate(): Record<string, boolean> {
    const e: Record<string, boolean> = {}
    for (const b of tmpl?.structure.blocks ?? []) {
      for (const q of b.questions ?? []) {
        if (!q.required) continue
        const entry = getEntry(q)
        if (entry.value === null || entry.value === '') e[q.id] = true
      }
    }
    if (!tmpl) {
      if (!strengths.trim()) e['strengths'] = true
      if (!areas.trim()) e['areas'] = true
      if (!rating) e['rating'] = true
    }
    if (!startedOnTime && !delayMin) e['delayMin'] = true
    return e
  }

  // ── Save ──
  async function handleSave(complete: boolean) {
    if (complete) {
      const e = validate()
      if (Object.keys(e).length > 0) {
        setErrs(e)
        setSaveError(t('fill.fill_required_error'))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
    setErrs({})
    setSaveError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/quality-control/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          strengths: strengths || null,
          areas_for_improvement: areas || null,
          action_item: actionItem || null,
          overall_rating: rating,
          teacher_feedback: feedback || null,
          started_on_time: startedOnTime,
          delay_minutes: !startedOnTime ? delayMin : null,
          delay_reason: !startedOnTime ? (delayReason || null) : null,
          technical_issues: techIssues || null,
          status: complete ? 'completed' : 'in_progress',
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        setSaveError(j.error ?? t('fill.save_error'))
        return
      }
      if (complete) {
        router.push('/dashboard/quality-control')
      } else {
        setCheck(prev => prev ? { ...prev, status: 'in_progress' } : prev)
        setSaveError('')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Render guards ──
  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{tCommon('loading')}</div>
  }
  if (!check) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{t('fill.not_found')}</div>
  }

  const blocks = tmpl?.structure.blocks ?? []
  const adminBlock = blocks.find(b => b.type === 'admin_info')
  const summaryBlock = blocks.find(b => b.type === 'summary')
  const contentBlocks = blocks.filter(b => b.type !== 'admin_info' && b.type !== 'summary')

  const [sBg, sColor] = STATUS_COLOR[check.status] ?? ['#F3F4F6', '#6B7280']

  function fmtDate(d: string) {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return d }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
        <Breadcrumb items={[
          { label: tNav('home'), href: '/dashboard' },
          { label: t('title'), href: '/dashboard/quality-control' },
          { label: t('fill.breadcrumb_title') },
        ]} />

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 20px', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>{t('fill.page_title')}</h1>
            {tmpl && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{tmpl.name}</p>}
          </div>
          <span style={{ padding: '4px 14px', borderRadius: 20, backgroundColor: sBg, color: sColor, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {t(`status.${check.status}`, check.status)}
          </span>
        </div>

        {saveError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
            {saveError}
          </div>
        )}

        {/* ── Info card ── */}
        <BlockCard title={adminBlock?.title ?? t('fill.info_title')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {[
              [t('fill.field_teacher'), check.teacher_name ?? '—'],
              [t('fill.field_observer'), check.observer_name ?? '—'],
              [t('fill.field_lesson_date'), fmtDate(check.lesson_date)],
              [t('fill.field_time'), check.lesson_time.slice(0, 5)],
              [t('fill.field_group'), check.group_name ?? '—'],
              [t('fill.field_course_subject'), check.course_name ?? '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2, fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 13, color: '#111827', fontWeight: 500, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </BlockCard>

        {/* ── Organizational section ── */}
        <BlockCard title={t('fill.org_title')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: isRO ? 'default' : 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={startedOnTime} disabled={isRO}
              onChange={e => setStartedOnTime(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#BE185D' }} />
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{t('fill.started_on_time')}</span>
          </label>

          {!startedOnTime && (
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  {t('fill.delay_minutes_label')}
                  {errs['delayMin'] && <span style={{ color: '#EF4444' }}> *</span>}
                </label>
                <input type="number" min={1} value={delayMin ?? ''} disabled={isRO}
                  onChange={e => setDelayMin(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: `1px solid ${errs['delayMin'] ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{t('fill.delay_reason_label')}</label>
                <input type="text" value={delayReason} disabled={isRO} placeholder={t('fill.delay_reason_placeholder')}
                  onChange={e => setDelayReason(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{t('fill.tech_issues_label')}</label>
            <textarea value={techIssues} disabled={isRO} rows={2}
              placeholder={t('fill.tech_issues_placeholder')}
              onChange={e => setTechIssues(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', resize: 'vertical', boxSizing: 'border-box', backgroundColor: isRO ? '#F9FAFB' : '#fff' }} />
          </div>
        </BlockCard>

        {/* ── Content blocks from template ── */}
        {contentBlocks.map(block => (
          <BlockCard key={block.id} title={block.title}>
            {(block.questions ?? []).length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>{t('fill.no_questions_block')}</p>
            ) : (
              (block.questions ?? []).map(q => (
                <QuestionRow key={q.id} q={q} entry={getEntry(q)} onChange={e => setEntry(q, e)} disabled={isRO} err={errs[q.id]} />
              ))
            )}
          </BlockCard>
        ))}

        {!tmpl && (
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB', padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
            <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0 }}>{t('fill.no_template_hint')}</p>
          </div>
        )}

        {/* ── Summary section ── */}
        <BlockCard title={summaryBlock?.title ?? t('fill.summary_title')}>
          {summaryBlock?.questions ? (
            summaryBlock.questions.map(q => (
              <QuestionRow key={q.id} q={q} entry={getEntry(q)} onChange={e => setEntry(q, e)} disabled={isRO} err={errs[q.id]} />
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { key: 'strengths',  label: t('fill.strengths_label'),   val: strengths,   set: setStrengths, req: true },
                { key: 'areas',      label: t('fill.areas_label'),       val: areas,       set: setAreas,     req: true },
                { key: 'actionItem', label: t('fill.action_item_label'), val: actionItem,  set: setActionItem,req: false },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    {f.label}
                    {f.req && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
                  </label>
                  <textarea value={f.val} disabled={isRO} rows={3} placeholder={`${f.label}...`}
                    onChange={e => f.set(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${errs[f.key] ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6, outline: 'none', resize: 'vertical', boxSizing: 'border-box', backgroundColor: isRO ? '#F9FAFB' : '#fff' }} />
                </div>
              ))}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  {t('fill.overall_rating_label')} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ScaleInput value={rating} onChange={setRating} disabled={isRO} err={!!errs['rating']} />
                {errs['rating'] && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{t('fill.required_field')}</p>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{t('fill.feedback_label')}</label>
                <textarea value={feedback} disabled={isRO} rows={3}
                  placeholder={t('fill.feedback_placeholder')}
                  onChange={e => setFeedback(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', resize: 'vertical', boxSizing: 'border-box', backgroundColor: isRO ? '#F9FAFB' : '#fff' }} />
              </div>
            </div>
          )}
        </BlockCard>
      </div>

      {/* ── Sticky footer ── */}
      <div style={{
        position: 'fixed', bottom: 0,
        left: footerLeft, right: 0, zIndex: 50,
        backgroundColor: '#fff', borderTop: '1px solid #E5E7EB',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
        transition: 'left 0.2s ease',
      }}>
        {saveError && (
          <span style={{ fontSize: 12, color: '#DC2626', flex: 1, marginRight: 8 }}>{saveError}</span>
        )}
        <Link href="/dashboard/quality-control"
          style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151', textDecoration: 'none', backgroundColor: '#fff' }}>
          {tCommon('back')}
        </Link>
        {!isRO && (
          <>
            <button type="button" onClick={() => handleSave(false)} disabled={saving}
              style={{ padding: '8px 18px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: saving ? 'not-allowed' : 'pointer', color: '#374151', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? t('fill.saving') : t('fill.save_draft')}
            </button>
            <button type="button" onClick={() => handleSave(true)} disabled={saving}
              style={{ padding: '8px 20px', fontSize: 13, border: 'none', borderRadius: 6, background: saving ? '#F9A8D4' : '#BE185D', cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', fontWeight: 600 }}>
              {saving ? t('fill.saving') : t('fill.complete_check')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
