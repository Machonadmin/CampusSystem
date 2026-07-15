'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'

// Публичная посадочная страница + форма подачи заявки. НЕ под middleware
// (matcher не покрывает /apply) → доступна без входа. Собственный «бренд»-стиль
// (розово-фиолетовый), а не консольные токены дашборда: это внешняя витрина.

interface Program {
  id: string
  name: string
  institution_name: string | null
}

const PINK = '#BE185D'
const HERO_GRAD = `linear-gradient(135deg,${PINK} 0%,#9333EA 100%)`

export default function ApplyPage() {
  const router = useRouter()
  const { lang, setLang, isRTL } = useLang()
  const t = useTranslations('apply')

  const [programs, setPrograms] = useState<Program[]>([])
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    birth_date: '', city: '', direction_id: '', website: '',
    applicant_type: 'student', comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/public/programs')
      .then(r => (r.ok ? r.json() : []))
      .then((data: Program[]) => setPrograms(Array.isArray(data) ? data : []))
      .catch(() => setPrograms([]))
  }, [])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.first_name.trim()) { setError(t('error_first_name_required')); return }
    if (!form.phone.trim()) { setError(t('error_phone_required')); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/public/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setDone(true)
      } else if (res.status === 429) {
        setError(t('error_rate_limited'))
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? t('error_generic'))
      }
    } catch {
      setError(t('error_network'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 15, border: '1px solid #D1D5DB',
    borderRadius: 8, outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5,
  }

  const VALUES = [
    { icon: '🤝', title: t('value1_title'), body: t('value1_body') },
    { icon: '📚', title: t('value2_title'), body: t('value2_body') },
    { icon: '💜', title: t('value3_title'), body: t('value3_body') },
  ]

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{
      minHeight: '100vh', background: 'linear-gradient(180deg,#FDF2F8 0%,#F5F3FF 100%)',
      fontFamily: 'var(--font-heebo), sans-serif', color: '#111827', scrollBehavior: 'smooth',
    }}>
      {/* Language switcher */}
      <div style={{ position: 'fixed', top: 16, [isRTL ? 'left' : 'right']: 16, zIndex: 20 }}>
        <div style={{
          display: 'flex', gap: 2, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 8,
          padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          {(['he', 'en', 'ru'] as Lang[]).map(l => (
            <button key={l} type="button" onClick={() => { setLang(l); router.refresh() }}
              style={{
                width: 32, padding: '4px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                color: lang === l ? '#fff' : '#6B7280',
                backgroundColor: lang === l ? PINK : 'transparent',
              }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{ background: HERO_GRAD, padding: '84px 20px 72px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.15 }}>
            {t('campus_title')}
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2.5vw, 19px)', color: 'rgba(255,255,255,0.92)', margin: '16px auto 0', maxWidth: 560, lineHeight: 1.6 }}>
            {t('hero_tagline')}
          </p>
          <a href="#register" style={{
            display: 'inline-block', marginTop: 28, padding: '13px 34px', fontSize: 16, fontWeight: 700,
            color: PINK, background: '#fff', borderRadius: 999, textDecoration: 'none',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          }}>
            {t('hero_cta')}
          </a>
        </div>
      </section>

      {/* ── VALUE PROPS ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {VALUES.map((v, i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 16, padding: '22px 20px', textAlign: 'center',
              boxShadow: '0 6px 24px rgba(190,24,93,0.08)', border: '1px solid #FBE4EF',
            }}>
              <div style={{ fontSize: 30 }}>{v.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '10px 0 6px' }}>{v.title}</h3>
              <p style={{ fontSize: 14, color: '#6B7280', margin: 0, lineHeight: 1.6 }}>{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROGRAMS ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 8px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 28px)', fontWeight: 800, color: '#111827', margin: 0 }}>
          {t('programs_heading')}
        </h2>
        <p style={{ fontSize: 15, color: '#6B7280', margin: '8px auto 24px', maxWidth: 520 }}>{t('programs_note')}</p>
        {programs.length === 0 ? (
          <p style={{ fontSize: 14, color: '#9CA3AF' }}>{t('programs_empty')}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, textAlign: 'start' }}>
            {programs.map(p => (
              <div key={p.id} style={{
                background: '#fff', borderRadius: 12, padding: '16px 18px',
                border: '1px solid #F3D9E7', boxShadow: '0 2px 10px rgba(190,24,93,0.05)',
                borderInlineStart: `4px solid ${PINK}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{p.name}</div>
                {p.institution_name && <div style={{ fontSize: 12.5, color: '#9333EA', marginTop: 3 }}>{p.institution_name}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── REGISTER FORM ────────────────────────────────────────────── */}
      <section id="register" style={{ padding: '48px 16px 56px', display: 'flex', justifyContent: 'center', scrollMarginTop: 12 }}>
        <div style={{
          width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16,
          boxShadow: '0 10px 40px rgba(190,24,93,0.12)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ background: HERO_GRAD, padding: '26px 32px' }}>
            <h2 style={{ fontSize: 21, fontWeight: 700, color: '#fff', margin: 0 }}>{t('register_heading')}</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', margin: '6px 0 0' }}>{t('form_subtitle')}</p>
          </div>

          {done ? (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✓</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>{t('success_title')}</h2>
              <p style={{ fontSize: 15, color: '#6B7280', margin: 0, lineHeight: 1.6 }}>{t('success_body')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ padding: '28px 32px' }}>
              {error && (
                <div style={{
                  marginBottom: 18, padding: '10px 14px', backgroundColor: '#FEF2F2',
                  border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 14, color: '#DC2626',
                }}>
                  {error}
                </div>
              )}

              {/* Honeypot — скрыт от людей, боты заполняют */}
              <div style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
                <label>{t('honeypot_label')}
                  <input type="text" tabIndex={-1} autoComplete="off"
                    value={form.website} onChange={e => set('website', e.target.value)} />
                </label>
              </div>

              {/* Кто заполняет */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>{t('applicant_type_label')}</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([['student', t('type_student')], ['parent', t('type_parent')], ['representative', t('type_representative')]] as const).map(([val, lbl]) => {
                    const active = form.applicant_type === val
                    return (
                      <button key={val} type="button" onClick={() => set('applicant_type', val)}
                        style={{
                          flex: '1 1 auto', padding: '9px 12px', fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                          border: `1.5px solid ${active ? PINK : '#E5E7EB'}`,
                          background: active ? '#FDF2F8' : '#fff',
                          color: active ? PINK : '#6B7280', transition: 'all 0.15s',
                        }}>
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>{t('label_first_name')} <span style={{ color: PINK }}>*</span></label>
                  <input style={inputStyle} value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>{t('label_last_name')}</label>
                  <input style={inputStyle} value={form.last_name} onChange={e => set('last_name', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>{t('label_phone')} <span style={{ color: PINK }}>*</span></label>
                  <input style={inputStyle} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>{t('label_email')}</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>{t('label_birth_date')}</label>
                  <input style={inputStyle} type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>{t('label_city')}</label>
                  <input style={inputStyle} value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>{t('label_program')}</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.direction_id} onChange={e => set('direction_id', e.target.value)}>
                  <option value="">{t('program_placeholder')}</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.institution_name ? ` — ${p.institution_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>{t('label_comment')}</label>
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
                  value={form.comment}
                  onChange={e => set('comment', e.target.value)}
                  placeholder={t('comment_placeholder')}
                  rows={3}
                />
              </div>

              <button type="submit" disabled={submitting} style={{
                width: '100%', padding: '12px', fontSize: 16, fontWeight: 700, color: '#fff',
                border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer',
                background: submitting ? '#F9A8D4' : PINK, transition: 'background 0.15s',
              }}>
                {submitting ? t('submitting') : t('submit')}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ padding: '20px 16px 28px', textAlign: 'center', fontSize: 12.5, color: '#9CA3AF' }}>
        {t('campus_title')} · © {t('footer_note')}
      </footer>
    </div>
  )
}
