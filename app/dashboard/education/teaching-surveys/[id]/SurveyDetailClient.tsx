'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface Question { id: string; text: string; kind: 'rating' | 'text'; position: number }
interface Teacher { person_id: string; name: string }
interface Detail { survey: { id: string; title: string; is_open: boolean }; questions: Question[]; teachers: Teacher[] }
interface ResultResponse { respondent_name: string; respondent_role: string; submitted_at: string; answers: Record<string, { rating: number | null; text_value: string | null }> }
interface ResultTeacher { person_id: string; name: string; responses: ResultResponse[] }
interface Results { questions: Question[]; teachers: ResultTeacher[] }

// Черновик вопроса в редакторе (может не иметь id, пока не сохранён).
interface QDraft { text: string; kind: 'rating' | 'text' }

export default function SurveyDetailClient({ surveyId }: { surveyId: string }) {
  const t = useTranslations('education.teaching_surveys')
  const tNav = useTranslations('navigation')

  const [detail, setDetail] = useState<Detail | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Редактор вопросов
  const [drafts, setDrafts] = useState<QDraft[]>([])
  // Заполнение менеджером
  const [fillTeacher, setFillTeacher] = useState('')
  const [fillAnswers, setFillAnswers] = useState<Record<string, { rating: number | null; text: string }>>({})

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      fetch(`/api/education/teaching-surveys/${surveyId}`).then(x => x.ok ? x.json() : null).catch(() => null),
      fetch(`/api/education/teaching-surveys/${surveyId}/results`).then(x => x.ok ? x.json() : null).catch(() => null),
    ])
    setDetail(d)
    setResults(r)
    if (d?.questions) setDrafts(d.questions.map((q: Question) => ({ text: q.text, kind: q.kind })))
    if (!d) setErr(t('load_failed'))
    setLoaded(true)
  }, [surveyId, t])
  useEffect(() => { load() }, [load])

  const hasResponses = useMemo(() => (results?.teachers ?? []).some(t => t.responses.length > 0), [results])

  async function saveQuestions() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/teaching-surveys/${surveyId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: drafts.filter(d => d.text.trim()).map((d, i) => ({ text: d.text.trim(), kind: d.kind, position: i })) }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error || t('save_failed')); return }
      await load()
    } catch { setErr(t('save_failed')) } finally { setBusy(false) }
  }

  async function toggleOpen() {
    if (!detail) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/teaching-surveys/${surveyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_open: !detail.survey.is_open }) })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error || t('save_failed')); return }
      await load()
    } catch { setErr(t('save_failed')) } finally { setBusy(false) }
  }

  async function submitFill() {
    if (!fillTeacher || !detail) return
    setBusy(true); setErr(null)
    try {
      const answers = detail.questions.map(q => {
        const a = fillAnswers[q.id] ?? { rating: null, text: '' }
        return q.kind === 'rating' ? { question_id: q.id, rating: a.rating } : { question_id: q.id, text_value: a.text }
      })
      const res = await fetch(`/api/education/teaching-surveys/${surveyId}/responses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_person_id: fillTeacher, answers }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error || t('save_failed')) }
      else { setFillTeacher(''); setFillAnswers({}); await load() }
    } catch { setErr(t('save_failed')) } finally { setBusy(false) }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }
  const label: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }
  const inp: React.CSSProperties = { padding: '8px 11px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  // Средний рейтинг по вопросу для преподавателя.
  function avg(rt: ResultTeacher, qid: string): { value: string; n: number } {
    const vals = rt.responses.map(r => r.answers[qid]?.rating).filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) return { value: '—', n: 0 }
    return { value: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1), n: vals.length }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title'), href: '/dashboard/education/teaching-surveys' },
        { label: detail?.survey.title ?? '…' },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{detail?.survey.title ?? '…'}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{detail?.survey.is_open ? t('is_open') : t('is_closed')}</div>
        </div>
        {detail && (
          <button onClick={toggleOpen} disabled={busy}
            style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            {detail.survey.is_open ? t('close') : t('open')}
          </button>
        )}
      </div>

      {err && (
        <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>
      )}

      {!loaded ? <SkeletonRows /> : !detail ? (
        <EmptyState text={t('not_available')} />
      ) : (
        <>
          {/* Редактор вопросов */}
          <div style={card}>
            <div style={label}>{t('edit_questions')}</div>
            {hasResponses && <div style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>{t('questions_locked')}</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {drafts.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={d.text} disabled={hasResponses} placeholder={t('question_placeholder')}
                    onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                    style={{ ...inp, flex: 1, minWidth: 200 }} />
                  <select value={d.kind} disabled={hasResponses}
                    onChange={e => setDrafts(ds => ds.map((x, j) => j === i ? { ...x, kind: e.target.value as 'rating' | 'text' } : x))} style={inp}>
                    <option value="rating">{t('kind_rating')}</option>
                    <option value="text">{t('kind_text')}</option>
                  </select>
                  {!hasResponses && (
                    <button onClick={() => setDrafts(ds => ds.filter((_, j) => j !== i))}
                      style={{ ...inp, cursor: 'pointer', color: 'var(--danger)', border: '1px solid var(--border)' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {!hasResponses && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setDrafts(ds => [...ds, { text: '', kind: 'rating' }])}
                  style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>+ {t('add_question')}</button>
                <button onClick={saveQuestions} disabled={busy}
                  style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>{t('save_questions')}</button>
              </div>
            )}
          </div>

          {/* Заполнение менеджером */}
          {detail.questions.length > 0 && (
            <div style={card}>
              <div style={label}>{t('fill_title')}</div>
              <select value={fillTeacher} onChange={e => setFillTeacher(e.target.value)} style={{ ...inp, minWidth: 240, marginBottom: 12 }}>
                <option value="">{t('pick_teacher')}</option>
                {detail.teachers.map(tc => <option key={tc.person_id} value={tc.person_id}>{tc.name}</option>)}
              </select>
              {fillTeacher && (
                <div style={{ display: 'grid', gap: 12 }}>
                  {detail.questions.map(q => (
                    <div key={q.id}>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 5 }}>{q.text}</div>
                      {q.kind === 'rating' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3, 4, 5].map(n => {
                            const active = fillAnswers[q.id]?.rating === n
                            return (
                              <button key={n} onClick={() => setFillAnswers(a => ({ ...a, [q.id]: { rating: n, text: a[q.id]?.text ?? '' } }))}
                                style={{ width: 38, height: 38, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)' }}>{n}</button>
                            )
                          })}
                        </div>
                      ) : (
                        <textarea value={fillAnswers[q.id]?.text ?? ''} rows={2}
                          onChange={e => setFillAnswers(a => ({ ...a, [q.id]: { rating: a[q.id]?.rating ?? null, text: e.target.value } }))}
                          style={{ ...inp, width: '100%', resize: 'vertical' }} />
                      )}
                    </div>
                  ))}
                  <button onClick={submitFill} disabled={busy}
                    style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', justifySelf: 'start' }}>{t('submit')}</button>
                </div>
              )}
            </div>
          )}

          {/* Результаты */}
          <div style={card}>
            <div style={label}>{t('results')}</div>
            {!results || results.teachers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_results')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {results.teachers.map(rt => (
                  <div key={rt.person_id} style={{ border: '1px solid var(--surface-2)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                      {rt.name} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-faint)' }}>· {rt.responses.length} {t('responses_short')}</span>
                    </div>
                    {/* Средние по рейтинговым вопросам */}
                    <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                      {(results.questions).filter(q => q.kind === 'rating').map(q => {
                        const a = avg(rt, q.id)
                        return (
                          <div key={q.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'baseline' }}>
                            <span style={{ flex: 1, color: 'var(--text-muted)' }}>{q.text}</span>
                            <span style={{ fontWeight: 700, color: 'var(--accent-strong)' }}>{a.value}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>({a.n})</span>
                          </div>
                        )
                      })}
                    </div>
                    {/* Текстовые ответы + кто ответил */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {rt.responses.map((r, ri) => {
                        const texts = results.questions.filter(q => q.kind === 'text').map(q => r.answers[q.id]?.text_value).filter(Boolean)
                        return (
                          <div key={ri} style={{ fontSize: 12, borderInlineStart: '2px solid var(--surface-2)', paddingInlineStart: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.respondent_name}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, marginInlineStart: 6, padding: '1px 6px', borderRadius: 999, background: r.respondent_role === 'manager' ? 'rgba(13,148,136,0.14)' : 'rgba(16,185,129,0.14)', color: r.respondent_role === 'manager' ? 'var(--accent-strong)' : 'var(--success)' }}>
                              {r.respondent_role === 'manager' ? t('source_manager') : t('source_student')}
                            </span>
                            {texts.length > 0 && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{texts.join(' · ')}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
