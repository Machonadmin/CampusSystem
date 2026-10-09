'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import EmptyState from '@/components/ui/EmptyState'
import { toastError, toastSuccess } from '@/components/ui/toast'
import FeedbackModal from '@/components/dashboard/FeedbackModal'
import { FEEDBACK_STATUSES, MAX_REPLY_CHARS, type FeedbackStatus } from '@/lib/feedback/validation'

interface Item {
  id: string
  kind: 'bug' | 'suggestion'
  body: string
  page_url: string | null
  status: FeedbackStatus
  owner_reply: string | null
  created_at: string
  author_name?: string | null
  screenshots: { path: string; name: string; url: string | null }[]
}

const STATUS_TONE: Record<FeedbackStatus, BadgeTone> = {
  new: 'info',
  in_review: 'warn',
  in_progress: 'warn',
  done: 'success',
  rejected: 'neutral',
}

export default function FeedbackListClient() {
  const t = useTranslations('feedback')
  const tc = useTranslations('common')
  const { lang } = useLang()
  const [items, setItems] = useState<Item[] | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [failed, setFailed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback', { cache: 'no-store' })
      if (res.status === 403) { setForbidden(true); return }
      if (!res.ok) { setFailed(true); return }
      const d = await res.json() as { items: Item[]; is_owner: boolean }
      setItems(d.items)
      setIsOwner(d.is_owner)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (forbidden) {
    return (
      <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <ModuleHeader module="dashboard" title={t('page_title')} />
        <ForbiddenState />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{t('forbidden')}</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <ModuleHeader
        module="dashboard"
        title={isOwner ? t('page_title_owner') : t('page_title')}
        subtitle={isOwner ? t('page_subtitle_owner') : t('page_subtitle')}
        actions={<Button variant="primary" onClick={() => setModalOpen(true)}>{t('new_report')}</Button>}
      />

      {failed && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{tc('load_error')}</p>}
      {!failed && items === null && <Skeleton height={120} />}
      {items !== null && items.length === 0 && <EmptyState text={t('empty')} />}

      {items?.map(item => (
        <ReportCard key={item.id} item={item} isOwner={isOwner} lang={lang} onSaved={load} />
      ))}

      {modalOpen && <FeedbackModal onClose={() => { setModalOpen(false); load() }} />}
    </div>
  )
}

function ReportCard({ item, isOwner, lang, onSaved }: {
  item: Item
  isOwner: boolean
  lang: string
  onSaved: () => void
}) {
  const t = useTranslations('feedback')
  const [status, setStatus] = useState<FeedbackStatus>(item.status)
  const [reply, setReply] = useState(item.owner_reply ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = status !== item.status || reply.trim() !== (item.owner_reply ?? '')

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, owner_reply: reply.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null
        toastError(d?.error ?? t('save'))
        return
      }
      toastSuccess(t('save'))
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        padding: 16, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone={item.kind === 'bug' ? 'danger' : 'info'} label={t(item.kind === 'bug' ? 'kind_bug' : 'kind_suggestion')} />
        <Badge tone={STATUS_TONE[item.status]} label={t(`status_${item.status}`)} />
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {t('sent_at')}: {formatDateTime(item.created_at, lang)}
        </span>
        {isOwner && item.author_name && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('from')}: {item.author_name}</span>
        )}
      </div>

      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text)' }}>{item.body}</p>

      {item.page_url && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
          {t('page_note').split('{page}')[0]}<bdi dir="ltr">{item.page_url}</bdi>
        </p>
      )}

      {item.screenshots.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {item.screenshots.filter(s => s.url).map(s => (
            <a key={s.path} href={s.url!} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.url!}
                alt={s.name}
                style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}
              />
            </a>
          ))}
        </div>
      )}

      {!isOwner && item.owner_reply && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 10 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('reply_label')}</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{item.owner_reply}</p>
        </div>
      )}

      {isOwner && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            {t('status_label')}
            <select
              value={status}
              onChange={e => setStatus(e.target.value as FeedbackStatus)}
              style={{
                padding: '6px 8px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13,
              }}
            >
              {FEEDBACK_STATUSES.map(s => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
            </select>
          </label>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            maxLength={MAX_REPLY_CHARS}
            rows={2}
            placeholder={t('reply_placeholder')}
            aria-label={t('reply_label')}
            style={{
              width: '100%', resize: 'vertical', padding: 8, fontSize: 13,
              borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)',
              background: 'var(--surface)', color: 'var(--text)',
            }}
          />
          <div>
            <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving}>{t('save')}</Button>
          </div>
        </div>
      )}
    </article>
  )
}
