'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toastError } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'

/**
 * «מיזוג כפילויות» — находит записи-дубли одного человека и объединяет их:
 *   1) список кластеров (совпадение по имени/почте/телефону/ת.ז),
 *   2) выбор какой записи остаться + выбор значения поле-за-полем,
 *   3) подтверждение → POST /api/persons/merge (RPC merge_persons).
 * Только superadmin.
 */

type Reason = 'name' | 'email' | 'phone' | 'passport'
interface ClusterPerson { id: string; full_name: string; hebrew_name: string | null; email: string | null; passport_number: string | null; phone: string | null }
interface Cluster { reason: Reason; persons: ClusterPerson[] }

interface FullPerson {
  id: string
  last_name: string | null; first_name: string | null; middle_name: string | null
  hebrew_name: string | null; email: string | null; gender: string | null
  birth_date: string | null; passport_number: string | null; marital_status: string | null
  nationality: string | null; photo_url: string | null; phones: unknown; address: unknown
  full_name: string | null
}
interface Preview { keep: FullPerson; remove: FullPerson; links: { key: string; count: number }[] }

const FIELDS: { key: keyof FullPerson; labelKey: string; json?: boolean }[] = [
  { key: 'last_name', labelKey: 'f_last' },
  { key: 'first_name', labelKey: 'f_first' },
  { key: 'middle_name', labelKey: 'f_middle' },
  { key: 'hebrew_name', labelKey: 'f_hebrew' },
  { key: 'email', labelKey: 'f_email' },
  { key: 'phones', labelKey: 'f_phones', json: true },
  { key: 'passport_number', labelKey: 'f_passport' },
  { key: 'birth_date', labelKey: 'f_birth' },
  { key: 'gender', labelKey: 'f_gender' },
  { key: 'marital_status', labelKey: 'f_marital' },
  { key: 'nationality', labelKey: 'f_nationality' },
  { key: 'address', labelKey: 'f_address', json: true },
  { key: 'photo_url', labelKey: 'f_photo' },
]

function showVal(v: unknown, json: boolean): string {
  if (v == null || v === '') return '—'
  if (json) {
    if (Array.isArray(v)) return v.map(p => (p && typeof p === 'object' && 'number' in p) ? String((p as { number: unknown }).number) : String(p)).filter(Boolean).join(', ') || '—'
    if (typeof v === 'object') { const vals = Object.values(v as Record<string, unknown>).filter(Boolean); return vals.length ? vals.join(', ') : '—' }
  }
  return String(v)
}

export default function MergeDuplicatesModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations('staff.merge')
  const tCommon = useTranslations('common')
  const accent = getModuleColor('staff')

  const [loading, setLoading] = useState(true)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [pair, setPair] = useState<[ClusterPerson, ClusterPerson] | null>(null)

  useEffect(() => {
    fetch('/api/persons/duplicates').then(r => r.ok ? r.json() : { clusters: [] })
      .then(d => setClusters(Array.isArray(d.clusters) ? d.clusters : []))
      .catch(() => setClusters([]))
      .finally(() => setLoading(false))
  }, [])

  const reasonLabel = (r: Reason) => t(`reason_${r}`)

  // ── styles ──
  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }
  const badge = (): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: 'var(--accent-tint)', color: accent })

  return (
    <Modal onClose={onClose} maxWidth={pair ? 640 : 560} panelStyle={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{t('title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('subtitle')}</div>
        </div>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
        {pair ? (
          <MergeDetail pair={pair} onBack={() => setPair(null)} onDone={onDone} onClose={onClose} />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13.5 }}>{t('scanning')}</div>
        ) : clusters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 14 }}>{t('none_found')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {clusters.map((c, i) => (
              <div key={i} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={badge()}>{reasonLabel(c.reason)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('persons_count').replace('{n}', String(c.persons.length))}</span>
                </div>
                <ClusterPicker cluster={c} onMerge={(a, b) => setPair([a, b])} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Внутри кластера: выбрать ровно 2 записи и нажать «מזג». */
function ClusterPicker({ cluster, onMerge }: { cluster: Cluster; onMerge: (a: ClusterPerson, b: ClusterPerson) => void }) {
  const t = useTranslations('staff.merge')
  const accent = getModuleColor('staff')
  const [sel, setSel] = useState<string[]>(cluster.persons.slice(0, 2).map(p => p.id))
  const toggle = (id: string) => setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id])
  const canMerge = sel.length === 2
  const line = (p: ClusterPerson) => [p.email, p.phone, p.passport_number].filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {cluster.persons.map(p => {
        const on = sel.includes(p.id)
        return (
          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? accent : 'var(--border)'}`, background: on ? 'var(--accent-tint)' : 'var(--surface-2)' }}>
            <input type="checkbox" checked={on} onChange={() => toggle(p.id)} style={{ accentColor: accent }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.full_name}{p.hebrew_name ? ` · ${p.hebrew_name}` : ''}</div>
              {line(p) && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line(p)}</div>}
            </div>
          </label>
        )
      })}
      <button onClick={() => { const [a, b] = sel; onMerge(cluster.persons.find(p => p.id === a)!, cluster.persons.find(p => p.id === b)!) }}
        disabled={!canMerge}
        style={{ marginTop: 2, justifySelf: 'start', padding: '8px 18px', borderRadius: 8, border: 'none', background: canMerge ? accent : 'var(--border)', color: canMerge ? '#fff' : 'var(--text-faint)', fontSize: 13, fontWeight: 700, cursor: canMerge ? 'pointer' : 'not-allowed' }}>
        {t('merge_btn')}
      </button>
      {!canMerge && <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t('pick_two_hint')}</div>}
    </div>
  )
}

/** Детали слияния: кто остаётся + выбор поле-за-полем + подтверждение. */
function MergeDetail({ pair, onBack, onDone, onClose }: { pair: [ClusterPerson, ClusterPerson]; onBack: () => void; onDone: () => void; onClose: () => void }) {
  const t = useTranslations('staff.merge')
  const tCommon = useTranslations('common')
  const accent = getModuleColor('staff')

  const [survivorId, setSurvivorId] = useState<string>(pair[0].id)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState<Record<string, 'keep' | 'remove'>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const otherId = survivorId === pair[0].id ? pair[1].id : pair[0].id

  useEffect(() => {
    setLoading(true)
    fetch(`/api/persons/merge?keep=${survivorId}&remove=${otherId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Preview | null) => { setPreview(d); setChoice({}) })
      .catch(() => setPreview(null))
      .finally(() => setLoading(false))
  }, [survivorId, otherId])

  const diffFields = useMemo(() => {
    if (!preview) return []
    return FIELDS.filter(f => {
      const a = showVal(preview.keep[f.key], !!f.json)
      const b = showVal(preview.remove[f.key], !!f.json)
      return a !== b
    })
  }, [preview])

  async function doMerge() {
    if (busy || !preview) return
    setBusy(true)
    try {
      const fields: Record<string, unknown> = {}
      for (const f of diffFields) {
        if ((choice[f.key as string] ?? 'keep') === 'remove') fields[f.key as string] = preview.remove[f.key]
      }
      const res = await fetch('/api/persons/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: survivorId, remove_id: otherId, fields }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? t('err_generic')); setBusy(false); return }
      setDone(true)
      onDone()
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{t('done')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>{t('done_body')}</div>
        <button onClick={onClose} style={{ marginTop: 18, padding: '9px 22px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{tCommon('close')}</button>
      </div>
    )
  }

  const nameOf = (id: string) => pair.find(p => p.id === id)!.full_name
  const pill: React.CSSProperties = { fontSize: 11.5, padding: '3px 9px', borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <button onClick={onBack} style={{ justifySelf: 'start', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>‹ {t('back')}</button>

      {/* survivor picker */}
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('step_survivor')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {pair.map(p => {
            const on = survivorId === p.id
            return (
              <button key={p.id} onClick={() => setSurvivorId(p.id)}
                style={{ textAlign: 'start', padding: '11px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? accent : 'var(--border-strong)'}`, background: on ? 'var(--accent-tint)' : 'var(--surface)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.full_name}</div>
                <div style={{ fontSize: 11, color: on ? accent : 'var(--text-faint)', fontWeight: 600, marginTop: 3 }}>{on ? t('survivor_yes') : t('survivor_no')}</div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('survivor_hint')}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>{t('loading')}</div>
      ) : preview ? (
        <>
          {/* field chooser */}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('step_fields')}</div>
            {diffFields.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('no_diff')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {diffFields.map(f => {
                  const cur = choice[f.key as string] ?? 'keep'
                  const keepV = showVal(preview.keep[f.key], !!f.json)
                  const remV = showVal(preview.remove[f.key], !!f.json)
                  const opt = (which: 'keep' | 'remove', v: string) => (
                    <button onClick={() => setChoice(prev => ({ ...prev, [f.key as string]: which }))}
                      style={{ flex: 1, minWidth: 0, textAlign: 'start', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${cur === which ? accent : 'var(--border)'}`, background: cur === which ? 'var(--accent-tint)' : 'var(--surface-2)', color: 'var(--text)', fontSize: 12.5 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span>
                    </button>
                  )
                  return (
                    <div key={f.key as string}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t(f.labelKey)}</div>
                      <div style={{ display: 'flex', gap: 8 }}>{opt('keep', keepV)}{opt('remove', remV)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* what moves */}
          {preview.links.length > 0 && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('what_moves')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preview.links.map(l => <span key={l.key} style={pill}>{t(`l_${l.key}`, l.key)}: {l.count}</span>)}
              </div>
            </div>
          )}

          {/* confirm */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--danger, #C0392B)', fontWeight: 600 }}>⚠ {t('confirm_warn').replace('{name}', nameOf(otherId))}</div>
            <SubmitButton onClick={doMerge} loading={busy} disabled={busy}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              {t('confirm_btn').replace('{keep}', nameOf(survivorId))}
            </SubmitButton>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--danger, #C0392B)' }}>{t('err_generic')}</div>
      )}
    </div>
  )
}
