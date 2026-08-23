'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Question { id: string; text: string; kind: 'rating' | 'text' }
interface Teacher { person_id: string; name: string; answered: boolean }
interface Survey { id: string; title: string; questions: Question[]; teachers: Teacher[] }

/**
 * Панель «Оценка преподавания» в личном кабинете студентки: открытые сборы +
 * её преподаватели. Оценка НЕ анонимна (решение владельца). Пусто/нет открытых
 * сборов → панель скрыта. Deploy-safe: API отдаёт [] без таблиц.
 */
export default function StudentTeachingSurveyPanel() {
  const t = useTranslations('portal.teaching_survey')
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState<{ surveyId: string; teacherId: string } | null>(null)
  const [answers, setAnswers] = useState<Record<string, { rating: number | null; text: string }>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const d = await fetch('/api/portal/teaching-surveys').then(r => r.ok ? r.json() : { surveys: [] }).catch(() => ({ surveys: [] }))
    setSurveys(d.surveys ?? [])
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(survey: Survey, teacherId: string) {
    setBusy(true); setErr('')
    try {
      const payload = survey.questions.map(q => {
        const a = answers[q.id] ?? { rating: null, text: '' }
        return q.kind === 'rating' ? { question_id: q.id, rating: a.rating } : { question_id: q.id, text_value: a.text }
      })
      const res = await fetch(`/api/portal/teaching-surveys/${survey.id}/responses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_person_id: teacherId, answers: payload }),
      })
      if (res.ok) { setActive(null); setAnswers({}); await load() }
      else setErr(t('save_failed'))
    } catch { setErr(t('save_failed')) } finally { setBusy(false) }
  }

  if (!loaded || surveys.length === 0) return null

  const btn = (active_: boolean): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
    border: `1px solid ${active_ ? 'var(--accent)' : 'var(--border)'}`, background: active_ ? 'var(--accent)' : 'var(--surface)', color: active_ ? '#fff' : 'var(--text-muted)',
  })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t('title')}</h3>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>{t('hint')}</div>

      <div style={{ display: 'grid', gap: 14 }}>
        {surveys.map(s => (
          <div key={s.id}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{s.title}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {s.teachers.map(tc => {
                const isActive = active?.surveyId === s.id && active?.teacherId === tc.person_id
                return (
                  <div key={tc.person_id} style={{ borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{tc.name}</div>
                      {tc.answered ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>✓ {t('answered')}</span>
                      ) : (
                        <button onClick={() => { setActive(isActive ? null : { surveyId: s.id, teacherId: tc.person_id }); setAnswers({}) }}
                          style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: isActive ? 'var(--surface)' : 'var(--accent)', color: isActive ? 'var(--text-muted)' : '#fff', ...(isActive ? { border: '1px solid var(--border)' } : {}) }}>
                          {isActive ? t('cancel') : t('rate')}
                        </button>
                      )}
                    </div>
                    {isActive && (
                      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                        {s.questions.map(q => (
                          <div key={q.id}>
                            <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 5 }}>{q.text}</div>
                            {q.kind === 'rating' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                {[1, 2, 3, 4, 5].map(n => (
                                  <button key={n} onClick={() => setAnswers(a => ({ ...a, [q.id]: { rating: n, text: a[q.id]?.text ?? '' } }))}
                                    style={btn(answers[q.id]?.rating === n)}>{n}</button>
                                ))}
                              </div>
                            ) : (
                              <textarea value={answers[q.id]?.text ?? ''} rows={2}
                                onChange={e => setAnswers(a => ({ ...a, [q.id]: { rating: a[q.id]?.rating ?? null, text: e.target.value } }))}
                                style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} />
                            )}
                          </div>
                        ))}
                        {err && <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>{err}</div>}
                        <button onClick={() => submit(s, tc.person_id)} disabled={busy}
                          style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
                          {t('submit')}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
