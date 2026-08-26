'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toast } from '@/components/ui/toast'

interface ApprovalRequest {
  id: string
  class_group_id: string
  class_group_name: string
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  requested_by_name: string
}

const hhmm = (t: string) => (t.length >= 5 ? t.slice(0, 5) : t)
// 2024-01-01 — понедельник; стабильный якорь для локализованных имён дней.
function weekdayLabel(lang: string, wd: number): string {
  const d = new Date(Date.UTC(2024, 0, wd))
  return d.toLocaleDateString(intlLocale(lang), { weekday: 'long', timeZone: 'UTC' })
}

export default function ScheduleApprovalsPage() {
  const t = useTranslations('education.schedule')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/education/schedule/approvals')
      if (res.status === 403) { setForbidden(true); setRequests([]); return }
      if (!res.ok) { setRequests([]); return }
      const b = await res.json()
      setRequests(b.requests ?? [])
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/education/schedule/slots/${id}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast(b.error ?? t('action_failed'), 'error')
        return
      }
      toast(decision === 'approve' ? t('approved_toast') : t('rejected_toast'), 'success')
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch {
      toast(t('action_failed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('approvals_title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>{t('approvals_title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('approvals_subtitle')}</p>
      </div>

      {loading ? (
        <SkeletonRows avatar={false} rows={4} />
      ) : forbidden ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('list.forbidden', 'אין הרשאה')}</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
          {t('approvals_empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.class_group_name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{weekdayLabel(lang, r.day_of_week)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(r.start_time)}–{hhmm(r.end_time)}</span>
                  {r.room && <span>· {r.room}</span>}
                </div>
                {r.requested_by_name && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{t('requested_by')}: {r.requested_by_name}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <SubmitButton
                  loading={busyId === r.id}
                  onClick={() => decide(r.id, 'reject')}
                  style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: 'var(--danger)', background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: 8 }}
                >
                  {t('reject')}
                </SubmitButton>
                <SubmitButton
                  loading={busyId === r.id}
                  onClick={() => decide(r.id, 'approve')}
                  style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--success)', border: 'none', borderRadius: 8 }}
                >
                  {t('approve')}
                </SubmitButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
