'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Room { id: string; name: string; capacity: number | null }
interface Building { id: string; name: string; code: string | null; rooms: Room[] }

const accent = getModuleColor('education')

export default function BuildingsTab() {
  const t = useTranslations('education.study')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [addingBuilding, setAddingBuilding] = useState(false)
  const [bName, setBName] = useState('')
  const [bCode, setBCode] = useState('')
  const [roomFor, setRoomFor] = useState<string | null>(null)
  const [rName, setRName] = useState('')
  const [rCap, setRCap] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/education/buildings')
      const j = r.ok ? await r.json() : { buildings: [] }
      setBuildings(j.buildings ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const createBuilding = async () => {
    if (!bName.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/education/buildings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: bName.trim(), code: bCode.trim() || null }) })
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.error ?? t('common.error_generic'), 'error'); return }
      setBName(''); setBCode(''); setAddingBuilding(false); load()
    } finally { setBusy(false) }
  }

  const createRoom = async (buildingId: string) => {
    if (!rName.trim()) return
    setBusy(true)
    try {
      const r = await fetch(`/api/education/buildings/${buildingId}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: rName.trim(), capacity: rCap.trim() ? Number(rCap) : null }) })
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.error ?? t('common.error_generic'), 'error'); return }
      setRName(''); setRCap(''); setRoomFor(null); load()
    } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }
  const smallBtn: React.CSSProperties = { padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('buildings.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('buildings.hint')}</div>
        </div>
        <PageActionButton label={t('buildings.add_building')} onClick={() => setAddingBuilding(v => !v)} accentColor={accent} />
      </div>

      {addingBuilding && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 16px', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <input value={bName} onChange={e => setBName(e.target.value)} placeholder={t('buildings.building_name')} style={{ ...inp, flex: '1 1 200px' }} autoFocus />
          <input value={bCode} onChange={e => setBCode(e.target.value)} placeholder={t('buildings.building_code')} style={{ ...inp, width: 120 }} />
          <button onClick={createBuilding} disabled={busy || !bName.trim()} style={{ ...smallBtn, color: '#fff', background: accent, border: 'none', opacity: busy || !bName.trim() ? 0.6 : 1 }}>{t('common.create')}</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('common.loading')}</div>
      ) : buildings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('buildings.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {buildings.map(b => (
            <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 15px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{b.name}</span>
                {b.code && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 99, padding: '1px 8px' }}>{b.code}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('buildings.rooms_count').replace('{n}', String(b.rooms.length))}</span>
                <button onClick={() => { setRoomFor(roomFor === b.id ? null : b.id); setRName(''); setRCap('') }} style={{ ...smallBtn, marginInlineStart: 'auto', color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: 'none' }}>{t('buildings.add_room')}</button>
              </div>

              {roomFor === b.id && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <input value={rName} onChange={e => setRName(e.target.value)} placeholder={t('buildings.room_name')} style={{ ...inp, flex: '1 1 160px' }} autoFocus />
                  <input value={rCap} onChange={e => setRCap(e.target.value)} type="number" min={0} placeholder={t('buildings.capacity')} style={{ ...inp, width: 110 }} />
                  <button onClick={() => createRoom(b.id)} disabled={busy || !rName.trim()} style={{ ...smallBtn, color: '#fff', background: accent, border: 'none', opacity: busy || !rName.trim() ? 0.6 : 1 }}>{t('common.create')}</button>
                </div>
              )}

              {b.rooms.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('buildings.no_rooms')}</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.rooms.map(r => (
                    <span key={r.id} style={{ fontSize: 12.5, color: 'var(--text)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                      {r.name}{r.capacity != null ? ` · ${r.capacity}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
