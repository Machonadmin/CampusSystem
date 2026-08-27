'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { formatMoney } from '@/lib/finance/money'

interface TrackRef { id: string; name_he: string | null; name_ru: string | null; name_en: string | null }
interface Semester {
  id: string
  name: string | null
  name_he: string | null
  year_label: string | null
  term_number: number | null
  status: 'open' | 'closed'
  tuition_amount: number | null
  study_track: TrackRef | null
  students_count: number
}

/**
 * Финансовый вид школьной платы (שכר לימוד) по РЕАЛЬНЫМ семестрам
 * (class_groups с is_semester=true). Семестры и студенток ведёт «Учёба» —
 * здесь Финансы задают сумму платы, и при сохранении порождаются счета tuition
 * для уже зачисленных студенток. Открытия/привязки студенток отсюда нет.
 */
export default function SemestersPage() {
  const t = useTranslations('finance.semesters')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/finance/semester-tuition')
      if (res.status === 403) { setErr(t('forbidden')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_failed')); return }
      const b = await res.json()
      setSemesters(b.semesters ?? [])
      setCanManage(!!b.can_manage)
    } catch { setErr(t('load_failed')) } finally { setLoading(false) }
  }, [t])
  useEffect(() => { load() }, [load])

  function trackName(tr: TrackRef | null): string {
    if (!tr) return ''
    if (lang === 'ru') return (tr.name_ru && tr.name_ru.trim()) || tr.name_he || tr.name_en || ''
    if (lang === 'en') return (tr.name_en && tr.name_en.trim()) || tr.name_he || tr.name_ru || ''
    return (tr.name_he && tr.name_he.trim()) || tr.name_ru || tr.name_en || ''
  }

  async function updatePrice(s: Semester, value: string) {
    const price = Number(value)
    if (!Number.isFinite(price) || price < 0) return
    if (Number(s.tuition_amount ?? NaN) === price) return
    const res = await fetch(`/api/finance/semester-tuition/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tuition_amount: price }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
    const b = await res.json().catch(() => ({}))
    setSemesters(prev => prev.map(x => x.id === s.id ? { ...x, tuition_amount: price } : x))
    const created = Number(b.charges_created ?? 0)
    toast(created > 0 ? t('charges_created_n').replace('{n}', String(created)) : t('tuition_saved'), 'success')
    if (b.warning) toast(String(b.warning), 'error')
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('title') },
      ]} />

      <ModuleHeader module="finance" title={t('title')} subtitle={t('subtitle')} />

      {err && <div style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</div>}

      {loading ? (
        <SkeletonRows rows={6} />
      ) : semesters.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('empty_finance')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {semesters.map(s => {
            const title = s.name_he?.trim() || s.name?.trim() || `${s.year_label ?? ''} · ${t('term_n').replace('{n}', String(s.term_number ?? ''))}`
            const track = trackName(s.study_track)
            return (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16, opacity: s.status === 'closed' ? 0.65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.status === 'open' ? 'var(--success-tint)' : 'var(--surface-2)', color: s.status === 'open' ? 'var(--success)' : 'var(--text-muted)' }}>
                    {t(`status_${s.status}`)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {[track, s.year_label, s.term_number != null ? t('term_n').replace('{n}', String(s.term_number)) : null].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('students_n').replace('{n}', String(s.students_count))}</div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('f_price')}</label>
                  {canManage ? (
                    <input
                      defaultValue={s.tuition_amount != null ? String(s.tuition_amount) : ''} type="number" min="0" step="0.01"
                      placeholder="0.00"
                      onBlur={e => updatePrice(s, e.target.value)}
                      style={{ ...inp, width: '100%' }}
                    />
                  ) : (
                    <div style={{ fontSize: 15, fontWeight: 700, color: primary }}>{s.tuition_amount != null ? formatMoney(s.tuition_amount) : '—'}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canManage && semesters.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t('price_bills_hint')}</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t('opened_in_studies')}</div>
    </div>
  )
}
