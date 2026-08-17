'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Мягкая, но обязательная первая смена временного пароля («חסימה עם בקשה רכה»).
 * Проверяет /api/auth/password-status; если нужно сменить — накрывает страницу
 * не-закрываемым оверлеем с формой нового пароля. Формулировка дружелюбная.
 * portal=true → студенточный эндпоинт. До миграции статус=false → оверлея нет.
 */
export default function ForcePasswordChangeGate({ portal = false }: { portal?: boolean }) {
  const t = useTranslations('force_password')
  const [must, setMust] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/password-status').then(r => r.ok ? r.json() : { must_change: false })
      .then(d => { if (alive) setMust(!!d.must_change) }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!must) return null

  const weak = pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)

  async function submit() {
    setErr(null)
    if (weak) { setErr(t('hint')); return }
    if (pw !== pw2) { setErr(t('mismatch')); return }
    setBusy(true)
    try {
      const res = await fetch(portal ? '/api/portal/force-password-change' : '/api/auth/force-password-change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_password: pw }),
      })
      if (res.ok) { window.location.reload(); return }
      const b = await res.json().catch(() => ({}))
      setErr(b.error || t('error'))
    } catch { setErr(t('error')) } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>{t('title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>{t('subtitle')}</p>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder={t('new_password')} style={inp} autoFocus />
          </div>
          <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} placeholder={t('confirm_password')}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} style={inp} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {t('show')}
          </label>
          <div style={{ fontSize: 11.5, color: weak && pw ? 'var(--danger)' : 'var(--text-faint)' }}>{t('hint')}</div>
          {err && <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{err}</div>}
          <button onClick={submit} disabled={busy}
            style={{ marginTop: 4, width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', opacity: busy ? 0.6 : 1 }}>
            {t('submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
