'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import SemesterStudentsModal from './SemesterStudentsModal'

interface Semester {
  id: string
  year_label: string
  term_number: number
  name: string | null
  price: number
  status: 'open' | 'closed'
  created_at: string
}

function fmtMoney(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Финансовый вид семестров: цена, привязка студенток и долг. Семестры
 * ОТКРЫВАЮТ в «Учёбе» (решение владельца) — здесь их только показываем и
 * ведём денежную часть. Открытия/закрытия отсюда нет.
 */
export default function SemestersPage() {
  const t = useTranslations('finance.semesters')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [manageSem, setManageSem] = useState<Semester | null>(null)

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/finance/semesters')
      if (res.status === 403) { setErr(t('forbidden')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_failed')); return }
      const b = await res.json()
      setSemesters(b.semesters ?? [])
      setCanManage(!!b.can_manage)
    } catch { setErr(t('load_failed')) } finally { setLoading(false) }
  }, [t])
  useEffect(() => { load() }, [load])

  async function updatePrice(s: Semester, value: string) {
    const price = Number(value)
    if (!Number.isFinite(price) || price < 0) return
    const res = await fetch(`/api/finance/semesters/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
    setSemesters(prev => prev.map(x => x.id === s.id ? { ...x, price } : x))
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('finance'), borderRadius: 12, padding: '16px 24px', color: '#fff' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {err && <div style={{ fontSize: 13, color: '#DC2626' }}>{err}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : semesters.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('empty_finance')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {semesters.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, opacity: s.status === 'closed' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name || `${s.year_label} · ${t('term_n').replace('{n}', String(s.term_number))}`}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.status === 'open' ? '#D1FAE5' : 'var(--surface-2)', color: s.status === 'open' ? '#065F46' : 'var(--text-muted)' }}>
                  {t(`status_${s.status}`)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.year_label} · {t('term_n').replace('{n}', String(s.term_number))}</div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('f_price')}</label>
                {canManage ? (
                  <input
                    defaultValue={String(s.price)} type="number" min="0"
                    onBlur={e => { if (Number(e.target.value) !== Number(s.price)) updatePrice(s, e.target.value) }}
                    style={{ ...inp, width: '100%' }}
                  />
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 700, color: primary }}>{fmtMoney(s.price)}</div>
                )}
              </div>

              {canManage && (
                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={() => setManageSem(s)}
                    style={{ width: '100%', fontSize: 12.5, fontWeight: 600, padding: '8px 10px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: 'pointer' }}
                  >
                    {t('manage_students')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t('opened_in_studies')}</div>
      )}

      {manageSem && (
        <SemesterStudentsModal
          semesterId={manageSem.id}
          title={manageSem.name || `${manageSem.year_label} · ${t('term_n').replace('{n}', String(manageSem.term_number))}`}
          onClose={() => setManageSem(null)}
        />
      )}
    </div>
  )
}
