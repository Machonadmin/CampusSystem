'use client'

import { useEffect, useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'
import { toast } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Access {
  can_view: boolean
  can_manage: boolean
  can_manage_access: boolean
  portal_visible: boolean
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Финансовая панель в карточке студентки. Доступ к финансам ОТДЕЛЬНЫЙ от доступа
 * к учебному делу — сотрудники без финансового доступа не видят ничего (null).
 */
export default function StudentFinancePanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('finance.access')
  const [access, setAccess] = useState<Access | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [portalVisible, setPortalVisible] = useState(false)
  const [personId, setPersonId] = useState<string | null>(null)
  const [granting, setGranting] = useState(false)

  const primary = getModuleColor('finance', 'primary')

  useEffect(() => {
    let alive = true
    fetch(`/api/finance/journeys/${journeyId}/access`)
      .then(r => (r.ok ? r.json() : null))
      .then((b: Access | null) => {
        if (!alive) return
        setAccess(b)
        if (b) setPortalVisible(!!b.portal_visible)
      })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  // Загрузить баланс, если есть право просмотра.
  useEffect(() => {
    if (!access?.can_view) return
    let alive = true
    fetch(`/api/finance/journeys/${journeyId}/ledger`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setBalance(b?.totals?.balance ?? null) })
      .catch(() => {/* ignore */})
    return () => { alive = false }
  }, [access?.can_view, journeyId])

  if (!loaded || !access) return null
  if (!access.can_view && !access.can_manage_access) return null

  async function togglePortal(next: boolean) {
    const prev = portalVisible
    setPortalVisible(next) // optimistic
    try {
      const res = await fetch(`/api/finance/journeys/${journeyId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_visible: next }),
      })
      if (res.status === 503) {
        setPortalVisible(prev)
        toast(t('portal_migration_missing'), 'error')
        return
      }
      if (!res.ok) {
        setPortalVisible(prev)
        toast(t('portal_toggle_failed'), 'error')
      }
    } catch {
      setPortalVisible(prev)
      toast(t('portal_toggle_failed'), 'error')
    }
  }

  async function grantForStudent() {
    if (!personId || granting) return
    setGranting(true)
    try {
      const res = await fetch('/api/finance/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, scope: 'journey', journey_id: journeyId }),
      })
      if (!res.ok) {
        toast(t('grant_failed'), 'error')
        return
      }
      toast(t('granted'), 'success')
      setPersonId(null)
    } catch {
      toast(t('grant_failed'), 'error')
    } finally {
      setGranting(false)
    }
  }

  const owes = balance !== null && balance > 0.005

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('panel_title')}</h3>

      {/* Баланс + ссылка на полную карточку */}
      {access.can_view && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('balance')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: balance === null ? 'var(--text-faint)' : (owes ? '#DC2626' : '#059669'), fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {balance === null ? '—' : fmtMoney(balance)}
            </div>
          </div>
          <a
            href={`/dashboard/finance/${journeyId}`}
            className="no-underline"
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: 'var(--surface-2)', color: primary, border: '1px solid var(--border-strong)' }}
          >
            {t('open_card')}
          </a>
        </div>
      )}

      {/* Управление доступом (только для менеджера) */}
      {access.can_manage_access && (
        <div style={{ marginTop: access.can_view ? 16 : 0, paddingTop: access.can_view ? 16 : 0, borderTop: access.can_view ? '1px solid var(--surface-2)' : 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Видно студентке в портале */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={portalVisible}
              onChange={e => togglePortal(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: primary, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('portal_visible')}</span>
          </label>

          {/* Выдать доступ к финансам этой студентки */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {t('grant_student_title')}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <PersonSelect
                  value={personId}
                  onChange={id => setPersonId(id)}
                  placeholder={t('pick_employee')}
                  accentColor={primary}
                />
              </div>
              <button
                onClick={grantForStudent}
                disabled={!personId || granting}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: primary, color: '#fff',
                  cursor: !personId || granting ? 'default' : 'pointer',
                  opacity: !personId || granting ? 0.5 : 1,
                }}
              >
                {t('grant_student_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
