'use client'

import { useEffect, useState } from 'react'

// Публичная страница подачи заявки. НЕ под middleware (matcher не покрывает
// /apply) → доступна без входа в систему. Тексты на иврите (RTL) — форма для
// абитуриентов; интернационализацию можно добавить позже.

interface Program {
  id: string
  name: string
  institution_name: string | null
}

const PINK = '#BE185D'

export default function ApplyPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    birth_date: '', city: '', direction_id: '', website: '',
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
    if (!form.first_name.trim()) { setError('נא למלא שם פרטי'); return }
    if (!form.phone.trim()) { setError('נא למלא מספר טלפון'); return }

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
        setError('נשלחו יותר מדי בקשות מכתובת זו. נסו שוב מאוחר יותר.')
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'אירעה שגיאה. נסו שוב.')
      }
    } catch {
      setError('אירעה שגיאה בשליחה. נסו שוב.')
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

  return (
    <div dir="rtl" style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#FDF2F8 0%,#F5F3FF 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      fontFamily: 'var(--font-heebo), sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 16,
        boxShadow: '0 10px 40px rgba(190,24,93,0.12)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${PINK} 0%,#9333EA 100%)`, padding: '28px 32px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>
            קמפוס «מכון חמש»
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', margin: '6px 0 0' }}>
            טופס הרשמה למועמדים
          </p>
        </div>

        {done ? (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
              תודה על ההרשמה!
            </h2>
            <p style={{ fontSize: 15, color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
              קיבלנו את הפרטים שלך. צוות הקמפוס יצור איתך קשר בהקדם.
            </p>
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
              <label>אל תמלא שדה זה
                <input type="text" tabIndex={-1} autoComplete="off"
                  value={form.website} onChange={e => set('website', e.target.value)} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>שם פרטי <span style={{ color: PINK }}>*</span></label>
                <input style={inputStyle} value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>שם משפחה</label>
                <input style={inputStyle} value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>טלפון <span style={{ color: PINK }}>*</span></label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>אימייל</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>תאריך לידה</label>
                <input style={inputStyle} type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>עיר מגורים</label>
                <input style={inputStyle} value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>תוכנית / מסלול מבוקש</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.direction_id} onChange={e => set('direction_id', e.target.value)}>
                <option value="">— בחר תוכנית —</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.institution_name ? ` — ${p.institution_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={submitting} style={{
              width: '100%', padding: '12px', fontSize: 16, fontWeight: 700, color: '#fff',
              border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer',
              background: submitting ? '#F9A8D4' : PINK, transition: 'background 0.15s',
            }}>
              {submitting ? 'שולח…' : 'שליחת הרשמה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
