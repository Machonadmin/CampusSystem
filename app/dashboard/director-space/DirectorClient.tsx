'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate, intlLocale } from '@/lib/i18n/format-date'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { inboxActions, type InboxAction, type InboxCategory } from '@/lib/director/rules'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

// ── Ответ /api/director/inbox ────────────────────────────────────────────────

interface Item {
  id: string
  category: InboxCategory
  who: string | null
  what: string | null
  by: string | null
  at: string | null
  href: string
  amount?: number | null
  percent?: number | null
  date?: string | null
  time?: string | null
  day_of_week?: number | null
  start_time?: string | null
  end_time?: string | null
  lesson_id?: string | null
  teacher_person_id?: string | null
  virtual?: boolean
}
interface Section { category: InboxCategory; total: number; items: Item[]; failed: boolean }
interface Inbox { role: 'director' | 'secretary'; sections: Section[]; can_decide?: InboxCategory[] }

// 2024-01-01 — понедельник; тот же якорь, что на экране утверждения расписания.
function weekdayLabel(lang: string, wd: number): string {
  return new Date(Date.UTC(2024, 0, wd)).toLocaleDateString(intlLocale(lang), { weekday: 'long', timeZone: 'UTC' })
}

export default function DirectorClient() {
  const t = useTranslations('director')
  const { lang } = useLang()
  const [data, setData] = useState<Inbox | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading')
  const [cat, setCat] = useState<InboxCategory | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/director/inbox', { cache: 'no-store' })
      .then(async r => {
        if (!alive) return
        if (r.status === 403) { setState('forbidden'); return }
        if (!r.ok) { setState('error'); return }
        setData(await r.json())
        setState('ok')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [])

  const canDecide = useMemo(() => new Set(data?.can_decide ?? []), [data])

  /** Решение уходит в тот же маршрут, что у исходного экрана; пункт убираем из ленты. */
  const decide = async (it: Item, kind: 'approve' | 'reject', action: InboxAction) => {
    if (kind === 'reject' && !(await confirmDialog({ message: t('confirm_reject'), tone: 'danger' }))) return
    const key = `${it.category}:${it.id}`
    setBusy(key)
    try {
      const r = await fetch(action.url, {
        method: action.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.body),
      })
      if (!r.ok) {
        const b = await r.json().catch(() => ({}))
        toastError(r.status === 403 ? t('no_permission') : (b.error ?? t('action_failed')))
        return
      }
      toastSuccess(kind === 'approve' ? t('approved') : t('rejected'))
      setData(prev => prev && {
        ...prev,
        sections: prev.sections.map(s => s.category !== it.category ? s : {
          ...s, total: Math.max(0, s.total - 1), items: s.items.filter(x => x.id !== it.id),
        }),
      })
    } catch {
      toastError(t('action_failed'))
    } finally { setBusy(null) }
  }

  const sections = useMemo(() => data?.sections ?? [], [data])
  const grandTotal = sections.reduce((n, s) => n + s.total, 0)
  const shown = cat === 'all' ? sections.filter(s => s.total > 0 || s.failed) : sections.filter(s => s.category === cat)

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: 12.5, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
    background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--text)',
  })

  const money = (n: number) => new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n)

  /** Вторая строка пункта: подробности по категории, без технических кодов. */
  const details = (it: Item): string[] => {
    const out: string[] = []
    if (it.what) out.push(it.what)
    if (it.category === 'schedule_slot' && it.day_of_week != null) {
      out.push(`${weekdayLabel(lang, it.day_of_week)} ${it.start_time ?? ''}–${it.end_time ?? ''}`)
    }
    if (it.category === 'discount' && it.percent != null) out.push(t('percent').replace('{n}', String(it.percent)))
    if (it.category === 'payment' && it.amount != null) out.push(money(it.amount))
    if (it.category === 'teacher_attendance' && it.date) {
      out.push(t('lesson').replace('{date}', `${formatDate(it.date, lang)}${it.time ? ` ${it.time}` : ''}`))
    }
    if (it.by) out.push(t('by').replace('{name}', it.by))
    return out
  }

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
      <ModuleHeader
        module="dashboard"
        title={t('title')}
        subtitle={data?.role === 'secretary' ? t('subtitle_secretary') : t('subtitle')}
      />

      {state === 'loading' && <Skeleton height={160} />}
      {state === 'error' && <p style={{ color: 'var(--danger)', fontSize: 14, margin: 0 }}>{t('load_error')}</p>}
      {state === 'forbidden' && <EmptyState text={t('forbidden')} />}

      {state === 'ok' && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {t('total').replace('{n}', String(grandTotal))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="tablist">
            <button type="button" role="tab" aria-selected={cat === 'all'} style={chip(cat === 'all')} onClick={() => setCat('all')}>
              {t('all')} ({grandTotal})
            </button>
            {sections.map(s => (
              <button
                key={s.category} type="button" role="tab" aria-selected={cat === s.category}
                style={chip(cat === s.category)} onClick={() => setCat(s.category)}
              >
                {t(`cat_${s.category}`)} ({s.failed ? '!' : s.total})
              </button>
            ))}
          </div>

          {shown.length === 0 && <EmptyState text={cat === 'all' ? t('empty') : t('empty_category')} />}

          {shown.map(s => (
            <section key={s.category} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {t(`cat_${s.category}`)}
                {!s.failed && <Badge tone={s.total > 0 ? 'warn' : 'neutral'}>{s.total}</Badge>}
              </h2>
              {s.failed && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{t('category_failed')}</p>}
              {!s.failed && s.total === 0 && <EmptyState size="compact" text={t('empty_category')} />}
              {s.items.map(it => (
                <div
                  key={`${s.category}:${it.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 14px',
                    border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {it.who ?? it.what ?? t(`cat_${s.category}`)}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {details({ ...it, what: it.who ? it.what : null }).join(' · ')}
                    </div>
                  </div>
                  {it.at && (
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {formatDate(it.at, lang)}
                    </div>
                  )}
                  {canDecide.has(s.category) && (() => {
                    const acts = inboxActions(it)
                    const key = `${s.category}:${it.id}`
                    const btn = (bg: string, fg: string): React.CSSProperties => ({
                      fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, whiteSpace: 'nowrap',
                      background: bg, color: fg, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy === key ? 0.6 : 1,
                    })
                    return (
                      <>
                        {acts.approve && (
                          <button type="button" disabled={!!busy} style={btn('var(--accent)', '#fff')} onClick={() => decide(it, 'approve', acts.approve!)}>
                            {t('approve')}
                          </button>
                        )}
                        {acts.reject && (
                          <button type="button" disabled={!!busy} style={btn('var(--surface-2)', 'var(--danger)')} onClick={() => decide(it, 'reject', acts.reject!)}>
                            {t('reject')}
                          </button>
                        )}
                      </>
                    )
                  })()}
                  <Link
                    href={it.href} prefetch={false}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, whiteSpace: 'nowrap',
                      background: 'var(--surface-2)', color: 'var(--accent)', textDecoration: 'none',
                    }}
                  >
                    {t('open')}
                  </Link>
                </div>
              ))}
              {s.total > s.items.length && (
                <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: 0 }}>
                  {t('more').replace('{shown}', String(s.items.length)).replace('{total}', String(s.total))}
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
