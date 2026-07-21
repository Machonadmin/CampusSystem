'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import type { PublicFormConfig, BuiltinFieldKey } from '@/lib/public/form-config'

// Публичная посадочная страница + форма подачи заявки. НЕ под middleware
// (matcher не покрывает /apply) → доступна без входа. Собственный «бренд»-стиль
// (пергамент / вино / антикварное золото) — тёплая, достойная витрина женского
// еврейского кампуса, а не консольные токены дашборда.

interface Program {
  id: string
  name: string
  institution_name: string | null
}

// Стили пседокласса/hover/focus/адаптив — через <style> (инлайн их не покрывает).
const CSS = `
html{overflow-x:hidden;max-width:100%;}
.ap-root{max-width:100%;
  --ivory:#FBF6EE; --card:#fff; --ink:#2A2330; --muted:#857785;
  --plum:#6A2E52; --plum-deep:#48203A; --gold:#C0912F; --gold-soft:#E7CE93;
  --line:#ECE1D3; --line-strong:#E0D2BF; --focus:#8A3E6B;
  background:var(--ivory); color:var(--ink); min-height:100vh; scroll-behavior:smooth;
}
.ap-root *{box-sizing:border-box;}
.ap-root h1,.ap-root h2,.ap-root h3{margin:0;text-wrap:balance;line-height:1.15;}
.ap-root p{margin:0;max-width:100%;}
.ap-root svg{max-width:100%;}
.ap-eyebrow{font-size:12px;font-weight:700;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;}
.ap-topbar{position:sticky;top:0;z-index:30;background:rgba(251,246,238,.82);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}
.ap-topbar-in{max-width:1060px;margin:0 auto;padding:13px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.ap-brand{display:flex;align-items:center;gap:11px;}
.ap-logo{height:38px;width:auto;object-fit:contain;display:block;flex-shrink:0;}
.ap-brand-name{font-size:16px;font-weight:800;letter-spacing:-.01em;}
.ap-brand-sub{font-size:11.5px;color:var(--muted);margin-top:1px;}
.ap-lang{display:flex;gap:2px;background:#fff;border:1px solid var(--line-strong);border-radius:9px;padding:3px;}
.ap-lang button{min-width:34px;height:26px;border:0;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);background:transparent;transition:background .15s,color .15s;}
.ap-lang button.on{background:var(--plum);color:#fff;}
.ap-hero{position:relative;overflow:hidden;background:linear-gradient(155deg,var(--plum) 0%,var(--plum-deep) 100%);color:#fff;}
.ap-hero-motif{position:absolute;inset:0;opacity:.5;pointer-events:none;}
.ap-hero-in{position:relative;max-width:1060px;margin:0 auto;padding:74px 24px 70px;text-align:center;}
.ap-hero .ap-eyebrow{color:var(--gold-soft);}
.ap-hero h1{font-size:clamp(30px,5vw,50px);font-weight:800;margin-top:16px;letter-spacing:-.015em;}
.ap-lede{font-size:clamp(16px,2.4vw,20px);color:rgba(255,255,255,.9);max-width:60ch;margin:18px auto 0;line-height:1.65;}
.ap-cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:30px;}
.ap-btn-gold{display:inline-flex;align-items:center;gap:9px;padding:14px 30px;border-radius:999px;font-size:16px;font-weight:800;text-decoration:none;background:var(--gold);color:#3a2a08;box-shadow:0 14px 34px rgba(0,0,0,.28);border:1px solid var(--gold-soft);transition:transform .15s,box-shadow .15s;}
.ap-btn-gold:hover{transform:translateY(-2px);box-shadow:0 18px 40px rgba(0,0,0,.34);}
.ap-btn-ghost{display:inline-flex;align-items:center;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.42);transition:background .15s;}
.ap-btn-ghost:hover{background:rgba(255,255,255,.1);}
.ap-hero-rule{height:4px;background:linear-gradient(90deg,transparent,var(--gold),transparent);}
.ap-section{max-width:1060px;margin:0 auto;padding:62px 24px 8px;}
.ap-values{display:grid;grid-template-columns:repeat(3,1fr);}
.ap-value{padding:6px 26px;text-align:center;}
.ap-value + .ap-value{border-inline-start:1px solid var(--line-strong);}
.ap-value .ap-mark{width:44px;height:44px;margin:0 auto 14px;display:block;}
.ap-value h3{font-size:18px;font-weight:800;margin-bottom:7px;}
.ap-value p{font-size:14.5px;color:var(--muted);max-width:34ch;margin:0 auto;}
.ap-head{text-align:center;max-width:60ch;margin:0 auto 26px;}
.ap-head h2{font-size:clamp(23px,3.4vw,30px);font-weight:800;letter-spacing:-.01em;}
.ap-head p{font-size:15.5px;color:var(--muted);margin-top:9px;}
.ap-prog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:14px;}
.ap-prog{background:var(--card);border:1px solid var(--line);border-inline-start:4px solid var(--gold);border-radius:12px;padding:17px 18px;transition:transform .14s,box-shadow .14s;}
.ap-prog:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(106,46,82,.1);}
.ap-prog .pname{font-size:15.5px;font-weight:800;}
.ap-prog .pinst{font-size:12.5px;color:var(--plum);margin-top:4px;font-weight:600;}
.ap-form-section{padding:58px 16px 38px;display:flex;justify-content:center;scroll-margin-top:12px;}
.ap-form-card{width:100%;max-width:620px;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(72,32,58,.12);}
.ap-form-top{height:5px;background:linear-gradient(90deg,var(--gold-soft),var(--gold),var(--plum));}
.ap-form-head{padding:26px 32px 22px;border-bottom:1px solid var(--line);}
.ap-form-head h2{font-size:22px;font-weight:800;}
.ap-form-head p{font-size:14.5px;color:var(--muted);margin-top:6px;}
.ap-form{padding:26px 32px 30px;display:flex;flex-direction:column;gap:18px;}
.ap-field{display:flex;flex-direction:column;gap:6px;}
.ap-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.ap-form label{font-size:13px;font-weight:700;color:#4a3f47;}
.ap-req{color:var(--plum);}
.ap-form input,.ap-form select,.ap-form textarea{width:100%;padding:11px 13px;font-size:15px;font-family:inherit;color:var(--ink);background:#fff;border:1px solid var(--line-strong);border-radius:10px;outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box;}
.ap-form input::placeholder,.ap-form textarea::placeholder{color:#B7ABB3;}
.ap-form input:focus,.ap-form select:focus,.ap-form textarea:focus{border-color:var(--focus);box-shadow:0 0 0 3px rgba(138,62,107,.14);}
.ap-form textarea{resize:vertical;min-height:78px;}
.ap-seg{display:flex;gap:8px;flex-wrap:wrap;}
.ap-seg button{flex:1 1 auto;padding:10px 12px;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid var(--line-strong);background:#fff;color:var(--muted);border-radius:10px;transition:all .15s;font-family:inherit;}
.ap-seg button.on{border-color:var(--plum);background:#F7EEF3;color:var(--plum);}
.ap-submit{margin-top:4px;width:100%;padding:14px;font-size:16px;font-weight:800;cursor:pointer;color:#fff;background:var(--plum);border:0;border-radius:11px;transition:background .15s,transform .12s;}
.ap-submit:hover:not(:disabled){background:var(--plum-deep);transform:translateY(-1px);}
.ap-submit:disabled{opacity:.6;cursor:not-allowed;}
.ap-assure{display:flex;align-items:center;gap:8px;justify-content:center;font-size:12.5px;color:var(--muted);margin-top:2px;text-align:center;}
.ap-err{padding:11px 14px;background:#FCEEF4;border:1px solid #F3CFDF;border-radius:10px;font-size:14px;color:#9B1C4E;}
.ap-success{padding:48px 32px;text-align:center;}
.ap-success .ic{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:#F1E6D2;display:flex;align-items:center;justify-content:center;}
.ap-success h2{font-size:21px;font-weight:800;margin-bottom:8px;}
.ap-success p{font-size:15px;color:var(--muted);line-height:1.6;max-width:40ch;margin:0 auto;}
.ap-foot{margin-top:38px;border-top:1px solid var(--line);}
.ap-foot-in{max-width:1060px;margin:0 auto;padding:26px 24px 34px;text-align:center;}
.ap-foot-logo{height:44px;width:auto;object-fit:contain;display:block;margin:0 auto 12px;opacity:.92;}
.ap-foot .fname{font-size:14px;font-weight:800;}
.ap-foot .fnote{font-size:12.5px;color:var(--muted);margin-top:6px;}
.ap-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--gold);margin-inline:8px;vertical-align:middle;}
.ap-hp{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
@media (max-width:720px){
  .ap-values{grid-template-columns:1fr;}
  .ap-value + .ap-value{border-inline-start:0;border-top:1px solid var(--line-strong);padding-top:24px;margin-top:24px;}
  .ap-grid2{grid-template-columns:1fr;}
  .ap-brand-sub{display:none;}
  .ap-form,.ap-form-head{padding-inline:22px;}
}
@media (prefers-reduced-motion:reduce){.ap-root *{transition:none!important;}}
`

export default function ApplyPage() {
  const router = useRouter()
  const { lang, setLang, isRTL, t: g } = useLang()
  const t = useTranslations('apply')

  const [programs, setPrograms] = useState<Program[]>([])
  const [config, setConfig] = useState<PublicFormConfig | null>(null)
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
    fetch('/api/public/form-config')
      .then(r => (r.ok ? r.json() : null))
      .then((c: PublicFormConfig | null) => { if (c) setConfig(c) })
      .catch(() => { /* конфиг недоступен — форма работает по дефолту */ })
  }, [])

  // Настройка встроенного поля (видимость/обязательность). До загрузки конфига
  // и для неизвестного ключа — дефолт (видимо, необязательно): форма не «мигает».
  function fld(key: BuiltinFieldKey): { visible: boolean; required: boolean } {
    const f = config?.fields.find(x => x.key === key)
    return f ? { visible: f.visible, required: f.required } : { visible: true, required: false }
  }
  // Текст с переопределением набора (иначе — перевод по умолчанию).
  function tx(key: string): string {
    const o = config?.texts?.[lang]?.[key]
    return o && o.trim() ? o : t(key)
  }
  // Направления с учётом режима (все активные / выбранное подмножество).
  const visiblePrograms = config?.directions.mode === 'subset'
    ? programs.filter(p => config.directions.ids.includes(p.id))
    : programs

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

  const types = [
    ['student', t('type_student')],
    ['parent', t('type_parent')],
    ['representative', t('type_representative')],
  ] as const

  return (
    <div className="ap-root" dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'var(--font-heebo), -apple-system, "Segoe UI", system-ui, "Noto Sans Hebrew", sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="ap-topbar">
        <div className="ap-topbar-in">
          <div className="ap-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="ap-logo" width={44} height={38} />
            <div>
              <div className="ap-brand-name">{g.campusNameShort}</div>
              <div className="ap-brand-sub">{t('campus_title')}</div>
            </div>
          </div>
          <nav className="ap-lang" aria-label="language">
            {(['he', 'en', 'ru'] as Lang[]).map(l => (
              <button key={l} type="button" className={lang === l ? 'on' : ''}
                onClick={() => { setLang(l); router.refresh() }}>
                {l === 'he' ? 'ע' : l.toUpperCase()}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="ap-hero">
        <svg className="ap-hero-motif" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs><radialGradient id="apg" cx="50%" cy="18%" r="70%">
            <stop offset="0%" stopColor="#C0912F" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#C0912F" stopOpacity="0" />
          </radialGradient></defs>
          <rect width="1200" height="460" fill="url(#apg)" />
          <g fill="none" stroke="#C0912F" strokeWidth="1" opacity="0.28">
            <path d="M600 40 L672 165 L744 290 L600 290 L456 290 L528 165 Z" />
            <path d="M600 340 L528 215 L456 90 L600 90 L744 90 L672 215 Z" />
          </g>
        </svg>
        <div className="ap-hero-in">
          <div className="ap-eyebrow">{tx('hero_eyebrow')}</div>
          <h1>{tx('campus_title')}</h1>
          <p className="ap-lede">{tx('hero_tagline')}</p>
          <div className="ap-cta-row">
            <a className="ap-btn-gold" href="#register">
              {tx('hero_cta')}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d={isRTL ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'} stroke="#3a2a08" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a className="ap-btn-ghost" href="#programs">{tx('hero_cta_secondary')}</a>
          </div>
        </div>
        <div className="ap-hero-rule" />
      </section>

      {/* ── Values ───────────────────────────────────────────────── */}
      <section className="ap-section">
        <div className="ap-values">
          <div className="ap-value">
            <svg className="ap-mark" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#F7EEF3" /><path d="M15 24l5 5 10-12" stroke="#6A2E52" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <h3>{tx('value1_title')}</h3>
            <p>{tx('value1_body')}</p>
          </div>
          <div className="ap-value">
            <svg className="ap-mark" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#FBF3E4" /><path d="M22 13c4 0 7 3 7 6 0 5-7 10-7 10s-7-5-7-10c0-3 3-6 7-6z" stroke="#C0912F" strokeWidth="2.2" fill="none" strokeLinejoin="round" /></svg>
            <h3>{tx('value2_title')}</h3>
            <p>{tx('value2_body')}</p>
          </div>
          <div className="ap-value">
            <svg className="ap-mark" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#F7EEF3" /><path d="M16 27c0-3 2.5-5 6-5s6 2 6 5M22 20a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z" stroke="#6A2E52" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
            <h3>{tx('value3_title')}</h3>
            <p>{tx('value3_body')}</p>
          </div>
        </div>
      </section>

      {/* ── Programs ─────────────────────────────────────────────── */}
      <section className="ap-section" id="programs">
        <div className="ap-head">
          <div className="ap-eyebrow">{tx('programs_eyebrow')}</div>
          <h2>{tx('programs_heading')}</h2>
          <p>{tx('programs_note')}</p>
        </div>
        {visiblePrograms.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>{t('programs_empty')}</p>
        ) : (
          <div className="ap-prog-grid">
            {visiblePrograms.map(p => (
              <div key={p.id} className="ap-prog">
                <div className="pname">{p.name}</div>
                {p.institution_name && <div className="pinst">{p.institution_name}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Register form ────────────────────────────────────────── */}
      <section className="ap-form-section" id="register">
        <div className="ap-form-card">
          <div className="ap-form-top" />
          <div className="ap-form-head">
            <h2>{tx('register_heading')}</h2>
            <p>{tx('form_subtitle')}</p>
          </div>

          {done ? (
            <div className="ap-success">
              <div className="ic">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4 10-11" stroke="#6A2E52" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2>{t('success_title')}</h2>
              <p>{t('success_body')}</p>
            </div>
          ) : (
            <form className="ap-form" onSubmit={handleSubmit}>
              {error && <div className="ap-err">{error}</div>}

              {/* Honeypot — скрыт от людей, боты заполняют */}
              <div className="ap-hp" aria-hidden="true">
                <label>{t('honeypot_label')}
                  <input type="text" tabIndex={-1} autoComplete="off"
                    value={form.website} onChange={e => set('website', e.target.value)} />
                </label>
              </div>

              {fld('applicant_type').visible && (
                <div className="ap-field">
                  <label>{t('applicant_type_label')}</label>
                  <div className="ap-seg">
                    {types.map(([val, lbl]) => (
                      <button key={val} type="button" className={form.applicant_type === val ? 'on' : ''}
                        onClick={() => set('applicant_type', val)}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Имя (ядро, всегда) + фамилия (настраиваемая) */}
              <div className={fld('last_name').visible ? 'ap-grid2' : undefined}>
                <div className="ap-field">
                  <label>{t('label_first_name')} <span className="ap-req">*</span></label>
                  <input value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                </div>
                {fld('last_name').visible && (
                  <div className="ap-field">
                    <label>{t('label_last_name')}{fld('last_name').required && <span className="ap-req"> *</span>}</label>
                    <input value={form.last_name} onChange={e => set('last_name', e.target.value)} required={fld('last_name').required} />
                  </div>
                )}
              </div>

              {/* Телефон (ядро) + email */}
              <div className={fld('email').visible ? 'ap-grid2' : undefined}>
                <div className="ap-field">
                  <label>{t('label_phone')} <span className="ap-req">*</span></label>
                  <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} required />
                </div>
                {fld('email').visible && (
                  <div className="ap-field">
                    <label>{t('label_email')}{fld('email').required && <span className="ap-req"> *</span>}</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required={fld('email').required} />
                  </div>
                )}
              </div>

              {/* Дата рождения + город */}
              {(fld('birth_date').visible || fld('city').visible) && (
                <div className={fld('birth_date').visible && fld('city').visible ? 'ap-grid2' : undefined}>
                  {fld('birth_date').visible && (
                    <div className="ap-field">
                      <label>{t('label_birth_date')}{fld('birth_date').required && <span className="ap-req"> *</span>}</label>
                      <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} required={fld('birth_date').required} />
                    </div>
                  )}
                  {fld('city').visible && (
                    <div className="ap-field">
                      <label>{t('label_city')}{fld('city').required && <span className="ap-req"> *</span>}</label>
                      <input value={form.city} onChange={e => set('city', e.target.value)} required={fld('city').required} />
                    </div>
                  )}
                </div>
              )}

              {fld('direction').visible && (
                <div className="ap-field">
                  <label>{t('label_program')}{fld('direction').required && <span className="ap-req"> *</span>}</label>
                  <select value={form.direction_id} onChange={e => set('direction_id', e.target.value)} required={fld('direction').required}>
                    <option value="">{t('program_placeholder')}</option>
                    {visiblePrograms.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.institution_name ? ` — ${p.institution_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {fld('comment').visible && (
                <div className="ap-field">
                  <label>{t('label_comment')}{fld('comment').required && <span className="ap-req"> *</span>}</label>
                  <textarea value={form.comment} onChange={e => set('comment', e.target.value)}
                    placeholder={t('comment_placeholder')} rows={3} required={fld('comment').required} />
                </div>
              )}

              <button className="ap-submit" type="submit" disabled={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </button>

              <div className="ap-assure">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" stroke="#857785" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                {t('form_assurance')}
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="ap-foot">
        <div className="ap-foot-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="ap-foot-logo" width={52} height={44} />
          <div className="fname">{t('campus_title')}</div>
          <div className="fnote"><span className="ap-dot" /> © {t('footer_note')}</div>
        </div>
      </footer>
    </div>
  )
}
