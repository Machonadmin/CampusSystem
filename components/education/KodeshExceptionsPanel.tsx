'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface KodeshException {
  id: string
  reason: string | null
  effective_from: string
  effective_to: string | null
  approved_by_name: string | null
  created_at: string
}

/**
 * Исключения кодеша (חריגות קודש): одобренные менеджером освобождения студентки
 * от обязательных утренних слотов кодеша. Показывает список исключений
 * (причина, даты, кто одобрил). Менеджеру кодеша (can_manage) — форма выдачи
 * (причина + даты → POST) и снятие (× → DELETE). Не-менеджеру ничего не видно
 * (GET вернёт 403 → render null).
 */
export default function KodeshExceptionsPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.kodesh.exceptions')
  const { lang } = useLang()
  const [items, setItems] = useState<KodeshException[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [ok, setOk] = useState(false)
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    fetch(`/api/education/journeys/${journeyId}/kodesh-exceptions`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        if (b) {
          setOk(true)
          setItems(b.exceptions ?? [])
          setCanManage(!!b.can_manage)
        }
      })
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/kodesh-exceptions`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        if (!alive) return
        if (b) {
          setOk(true)
          setItems(b.exceptions ?? [])
          setCanManage(!!b.can_manage)
        }
      })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  async function grant() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/kodesh-exceptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          effective_from: from.trim() || undefined,
          effective_to: to.trim() || undefined,
        }),
      })
      if (r.ok) {
        setReason('')
        setFrom('')
        setTo('')
        load()
      }
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/kodesh-exceptions?exception_id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (r.ok) load()
    } finally {
      setBusy(false)
    }
  }

  const fmtDate = (d: string | null): string => {
    if (!d) return ''
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  // Не-менеджеру (403) и до загрузки ничего не показываем.
  if (!loaded || !ok) return null

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('title')}</h3>

      {canManage && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('reason_ph')}
            maxLength={2000}
            style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
              {t('from')}
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
              {t('to')}
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
              />
            </label>
          </div>
          <button
            onClick={grant}
            disabled={busy}
            style={{ justifySelf: 'start', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {t('grant')}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map(x => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {x.reason && <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 4 }}>{x.reason}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {fmtDate(x.effective_from)}{' — '}{x.effective_to ? fmtDate(x.effective_to) : t('ongoing')}
                </div>
                {x.approved_by_name && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    {t('granted_by')}: {x.approved_by_name}
                  </div>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => revoke(x.id)}
                  disabled={busy}
                  title={t('revoke')}
                  aria-label={t('revoke')}
                  style={{ flexShrink: 0, fontSize: 15, lineHeight: 1, color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 2 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
