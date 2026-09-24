'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useMe } from '@/lib/hooks/useMe'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'

/**
 * «חבר ליומן גוגל» — персональная iCal-подписка. Показывается ТОЛЬКО
 * суперадмину (пробный доступ по решению владельца); остальным — null.
 * Тянет URL из /api/calendar/feed-link и показывает инструкцию для Google.
 */
export function GoogleCalendarLink({ primary }: { primary: string }) {
  const t = useTranslations('calendar.gcal')
  const tCommon = useTranslations('common')
  const me = useMe()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!me?.roles?.includes('superadmin')) return null

  async function openDialog() {
    setOpen(true)
    if (url) return
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/feed-link')
      if (!res.ok) { toast(tCommon('load_error'), 'error'); return }
      const b = await res.json().catch(() => ({}))
      setUrl(b.url ?? null)
    } catch {
      toast(tCommon('load_error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast(t('copied'), 'success')
    } catch {
      toast(tCommon('action_failed'), 'error')
    }
  }

  const step = (n: number, text: string) => (
    <li style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <span style={{
        flex: 'none', width: 20, height: 20, borderRadius: 999, background: 'var(--accent-tint)',
        color: 'var(--accent-strong)', fontSize: 11, fontWeight: 800,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{text}</span>
    </li>
  )

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        style={{
          fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${primary}`, background: 'var(--surface)', color: primary,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        📅 {t('button')}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} ariaLabel={t('title')} maxWidth={540}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>{t('title')}</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>{t('intro')}</p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              readOnly
              value={loading ? '…' : (url ?? '')}
              aria-label={t('title')}
              onFocus={e => e.currentTarget.select()}
              style={{
                flex: '1 1 240px', minWidth: 0, fontSize: 12, fontFamily: 'var(--font-mono)',
                padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border-strong)',
                background: 'var(--surface-2)', color: 'var(--text)', direction: 'ltr',
              }}
            />
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              style={{
                fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8,
                border: 'none', cursor: url ? 'pointer' : 'default', background: primary, color: '#fff',
                opacity: url ? 1 : 0.5,
              }}
            >
              {t('copy')}
            </button>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            {t('steps_title')}
          </div>
          <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
            {step(1, t('step1'))}
            {step(2, t('step2'))}
            {step(3, t('step3'))}
            {step(4, t('step4'))}
          </ol>

          <p style={{
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55,
            background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 8, padding: '8px 11px', margin: 0,
          }}>
            {t('note')}
          </p>
        </Modal>
      )}
    </>
  )
}
