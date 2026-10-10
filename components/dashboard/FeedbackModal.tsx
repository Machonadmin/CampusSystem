'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toastError } from '@/components/ui/toast'
import {
  MAX_BODY_CHARS, MAX_SCREENSHOTS, checkScreenshots, type FeedbackKind,
} from '@/lib/feedback/validation'
import { shrinkScreenshot } from '@/lib/feedback/shrink'

/**
 * «הצעה לשיפור או באג» — форма замечания сотрудника. Открывается из шапки.
 * Текст + до 5 скриншотов (кнопкой или вставкой Ctrl+V прямо в поле текста);
 * скриншоты сжимаются в браузере ещё до отправки (lib/feedback/shrink.ts).
 * Путь текущего экрана уходит вместе с замечанием, чтобы было видно, «где».
 * Замечание только сохраняется: решает владелец (см. app/api/feedback).
 */
export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const pathname = usePathname()
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [sent, setSent] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Превью картинок: object URL на каждый файл, освобождаем при смене списка.
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  async function addFiles(incoming: File[]) {
    const images = incoming.filter(f => f.type.startsWith('image/'))
    if (images.length === 0 || preparing) return
    if (files.length + images.length > MAX_SCREENSHOTS) {
      toastError(t('too_many').replace('{max}', String(MAX_SCREENSHOTS)))
      return
    }
    // Сжимаем сразу при добавлении: к нажатию «שליחה» картинки уже маленькие.
    // Пока идёт сжатие, добавить/убрать картинку или отправить нельзя.
    setPreparing(true)
    try {
      const shrunk = await Promise.all(images.map(shrinkScreenshot))
      const next = [...files, ...shrunk]
      if (checkScreenshots(next)) {
        toastError(t('bad_file'))
        return
      }
      setFiles(next)
    } finally {
      setPreparing(false)
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files ?? [])
    if (pasted.length > 0) {
      // Картинку из буфера — в скриншоты; обычный текст вставляется как всегда.
      e.preventDefault()
      void addFiles(pasted)
    }
  }

  async function submit() {
    if (!body.trim() || sending || preparing) return
    setSending(true)
    try {
      const form = new FormData()
      form.set('kind', kind)
      form.set('body', body.trim())
      form.set('page', pathname ?? '')
      for (const f of files) form.append('screenshots', f, f.name || 'screenshot.png')
      const res = await fetch('/api/feedback', { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null
        toastError(d?.error ?? t('send'))
        return
      }
      setSent(true)
    } catch {
      toastError(t('send'))
    } finally {
      setSending(false)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }

  return (
    <Modal onClose={onClose} maxWidth={520} ariaLabel={t('title')} padding={16}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t('title')}</h2>
          <button
            onClick={onClose}
            aria-label={tc('close')}
            className="icon-ghost rounded-lg"
            style={{ width: 32, height: 32, color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--success)' }}>{t('sent_title')}</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>{t('sent_body')}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/dashboard/feedback" prefetch={false} onClick={onClose}>
                <Button variant="primary">{t('open_my_reports')}</Button>
              </Link>
              <Button variant="secondary" onClick={onClose}>{tc('close')}</Button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{t('intro')}</p>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={labelStyle}>{t('kind_label')}</legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['bug', 'suggestion'] as const).map(k => (
                  <label
                    key={k}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      padding: '8px 12px', borderRadius: 'var(--r-md)', fontSize: 14,
                      border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: kind === k ? 'var(--accent-tint, var(--surface-2))' : 'var(--surface)',
                    }}
                  >
                    <input type="radio" name="feedback-kind" checked={kind === k} onChange={() => setKind(k)} />
                    {t(k === 'bug' ? 'kind_bug' : 'kind_suggestion')}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="feedback-body" style={labelStyle}>{t('body_label')}</label>
              <textarea
                id="feedback-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                onPaste={onPaste}
                maxLength={MAX_BODY_CHARS}
                rows={5}
                placeholder={t('body_placeholder')}
                autoFocus
                style={{
                  width: '100%', resize: 'vertical', padding: 10, fontSize: 14,
                  borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)',
                  background: 'var(--surface)', color: 'var(--text)',
                }}
              />
            </div>

            <div>
              <span style={labelStyle}>{t('screenshots_label')}</span>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-faint)' }}>
                {t('screenshots_hint').replace('{max}', String(MAX_SCREENSHOTS))}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {previews.map((src, i) => (
                  <div key={src} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}
                    />
                    <button
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      disabled={preparing}
                      aria-label={t('remove_screenshot')}
                      title={t('remove_screenshot')}
                      style={{
                        position: 'absolute', top: -6, insetInlineEnd: -6, width: 22, height: 22,
                        borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border-strong)',
                        color: 'var(--text-muted)', fontSize: 13, lineHeight: '20px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {files.length < MAX_SCREENSHOTS && (
                  <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={preparing}>
                    {preparing ? t('preparing') : t('add_screenshot')}
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
                />
              </div>
            </div>

            {pathname && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
                {t('page_note').split('{page}')[0]}<bdi dir="ltr">{pathname}</bdi>
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
              <Button variant="primary" onClick={submit} disabled={sending || preparing || !body.trim()}>
                {sending ? t('sending') : t('send')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
