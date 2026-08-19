'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { getModuleColor } from '@/lib/module-colors'

interface ClassRow { id: string; name: string; subject: string | null; enrolled_at: string | null }
interface UnitGroup { unit_id: string | null; unit_name: string; classes: ClassRow[] }
interface Unit { id: string; name: string }

/**
 * Панель размещения ученицы: её классы, сгруппированные по учебной единице
 * (утро-קודש / после-полудня-חול). Руководитель единицы может зачислить в класс
 * своей единицы и убрать из него. Рендерит null, если данных нет и добавить
 * нельзя (не путать карточку студентки лишним пустым блоком).
 */
export default function PlacementsPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.placements')
  const accent = getModuleColor('education')

  const [units, setUnits] = useState<UnitGroup[]>([])
  const [managedIds, setManagedIds] = useState<string[] | null>(null) // null = superadmin (all)
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/placements`)
      if (res.ok) {
        const b = await res.json()
        setUnits(b.units ?? [])
        setManagedIds(b.is_super ? null : (b.managed_unit_ids ?? []))
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [journeyId])
  useEffect(() => { load() }, [load])

  const canManageAny = managedIds === null || (managedIds && managedIds.length > 0)
  const canManageUnit = (uid: string | null) => managedIds === null || (!!uid && !!managedIds?.includes(uid))

  async function remove(classId: string) {
    await fetch(`/api/education/class-groups/${classId}/enrollments/${journeyId}`, { method: 'DELETE' })
    load()
  }

  if (!loaded) return null
  if (units.length === 0 && !canManageAny) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('subtitle')}</div>
        </div>
        {canManageAny && (
          <button onClick={() => setAdding(a => !a)}
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
            + {t('add_to_class')}
          </button>
        )}
      </div>

      {adding && <AddPlacement journeyId={journeyId} accent={accent} onDone={() => { setAdding(false); load() }} />}

      {units.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {units.map(u => (
            <div key={u.unit_id ?? 'none'} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: 'var(--surface-2)', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)' }}>{u.unit_name}</div>
              <div>
                {u.classes.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                    {c.subject && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {c.subject}</span>}
                    {canManageUnit(u.unit_id) && (
                      <button onClick={() => remove(c.id)}
                        style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger-tint)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
                        {t('remove')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddPlacement({ journeyId, accent, onDone }: { journeyId: string; accent: string; onDone: () => void }) {
  const t = useTranslations('education.placements')
  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])
  const [classId, setClassId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/education/units').then(r => r.ok ? r.json() : null).then(b => setUnits(b?.units ?? []))
  }, [])
  useEffect(() => {
    if (!unitId) { setClasses([]); setClassId(''); return }
    fetch(`/api/education/class-groups?department_id=${unitId}`).then(r => r.ok ? r.json() : null).then(b => {
      setClasses((b?.class_groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })))
      setClassId('')
    })
  }, [unitId])

  async function add() {
    if (!classId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/education/class-groups/${classId}/enrollments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_ids: [journeyId] }),
      })
      if (res.ok) onDone()
    } finally { setBusy(false) }
  }

  const sel: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', flex: 1, minWidth: 140 }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, marginBottom: 12, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <select value={unitId} onChange={e => setUnitId(e.target.value)} style={sel}>
        <option value="">{t('pick_unit')}</option>
        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <select value={classId} onChange={e => setClassId(e.target.value)} style={sel} disabled={!unitId || classes.length === 0}>
        <option value="">{classes.length === 0 && unitId ? t('no_classes') : t('pick_class')}</option>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button onClick={add} disabled={!classId || busy}
        style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: classId ? 'pointer' : 'default', opacity: classId && !busy ? 1 : 0.6 }}>
        {t('add_btn')}
      </button>
    </div>
  )
}
