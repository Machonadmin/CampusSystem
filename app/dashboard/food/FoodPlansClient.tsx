'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Plan {
  id: string
  name: string
  code: string | null
  description: string | null
  includes_breakfast: boolean
  includes_lunch: boolean
  includes_dinner: boolean
  price: number | null
  period_label: string | null
  is_active: boolean
  active_count: number
}

function fmtPrice(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function FoodPlansClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('food')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [items, setItems] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [price, setPrice] = useState('')
  const [period, setPeriod] = useState('')
  const [breakfast, setBreakfast] = useState(true)
  const [lunch, setLunch] = useState(true)
  const [dinner, setDinner] = useState(true)

  const primary = getModuleColor('food', 'primary')
  const light = getModuleColor('food', 'light')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/food/plans')
      if (res.status === 403) { setError(t('list.forbidden')); setItems([]); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setItems([]); return
      }
      const b = await res.json()
      setItems(b.plans ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!name.trim()) { setFormError(t('form.required')); return }
    setBusy(true); setFormError(null)
    try {
      const res = await fetch('/api/food/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || null,
          price: price.trim() === '' ? null : Number(price),
          period_label: period.trim() || null,
          includes_breakfast: breakfast,
          includes_lunch: lunch,
          includes_dinner: dinner,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('form.save_error')); return
      }
      setName(''); setCode(''); setPrice(''); setPeriod(''); setBreakfast(true); setLunch(true); setDinner(true); setShowForm(false)
      await load()
    } catch {
      setFormError(t('form.save_error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('food') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('food'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(217,119,6,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('food')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.15)',
            color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            + {t('list.add_plan')}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canManage && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('form.name')} style={inp(200)} />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('form.code')} style={inp(110)} />
          <input value={price} onChange={e => setPrice(e.target.value)} placeholder={t('form.price')} type="number" min="0" step="0.01" style={inp(110)} />
          <input value={period} onChange={e => setPeriod(e.target.value)} placeholder={t('form.period')} style={inp(160)} />
          <label style={chk}><input type="checkbox" checked={breakfast} onChange={e => setBreakfast(e.target.checked)} /> {t('meal.breakfast')}</label>
          <label style={chk}><input type="checkbox" checked={lunch} onChange={e => setLunch(e.target.checked)} /> {t('meal.lunch')}</label>
          <label style={chk}><input type="checkbox" checked={dinner} onChange={e => setDinner(e.target.checked)} /> {t('meal.dinner')}</label>
          <button onClick={submit} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
          {formError && <span style={{ fontSize: 12, color: '#DC2626' }}>{formError}</span>}
        </div>
      )}

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('list.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {items.map(p => (
            <div
              key={p.id}
              onClick={() => router.push(`/dashboard/food/${p.id}`)}
              style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = primary }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E5E7EB' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{p.name}</div>
                {!p.is_active && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t('list.inactive')}</span>}
              </div>
              {p.code && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{p.code}</div>}

              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {p.includes_breakfast && <MealPill label={t('meal.breakfast')} bg={light} color={primary} />}
                {p.includes_lunch && <MealPill label={t('meal.lunch')} bg={light} color={primary} />}
                {p.includes_dinner && <MealPill label={t('meal.dinner')} bg={light} color={primary} />}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: primary }}>
                  {t('list.enrolled')}: {p.active_count}
                </span>
                {p.price !== null && <span style={{ fontSize: 13, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(p.price)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MealPill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: bg, color }}>
      {label}
    </span>
  )
}

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
const chk: React.CSSProperties = { fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }
