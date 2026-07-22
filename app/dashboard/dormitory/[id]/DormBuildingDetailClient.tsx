'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { OccupancyBar } from '../DormBuildingsClient'

interface Room {
  id: string
  room_number: string
  floor: number | null
  capacity: number
  is_active: boolean
  occupied: number
  free: number
  is_full: boolean
}
interface RoomAssignment {
  id: string
  journey_id: string
  assigned_from: string
  assigned_to: string | null
  status: 'active' | 'ended'
  student_name: string
  student_hebrew_name: string | null
}
interface StudentHit {
  journey_id: string
  full_name: string
  hebrew_name: string | null
  room: { room_number: string | null; building_name: string | null } | null
}

interface Props {
  buildingId: string
  buildingName: string
  canManage: boolean
}

export default function DormBuildingDetailClient({ buildingId, buildingName, canManage }: Props) {
  const t = useTranslations('dormitory')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('dormitory', 'primary')

  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // add-room form
  const [showRoomForm, setShowRoomForm] = useState(false)
  const [roomNumber, setRoomNumber] = useState('')
  const [floor, setFloor] = useState('')
  const [capacity, setCapacity] = useState('')
  const [roomError, setRoomError] = useState<string | null>(null)

  // selected room + its assignments
  const [selected, setSelected] = useState<Room | null>(null)
  const [assignments, setAssignments] = useState<RoomAssignment[]>([])
  const [panelError, setPanelError] = useState<string | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)

  // assign form
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [picked, setPicked] = useState<StudentHit | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const loadRooms = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/dormitory/buildings/${buildingId}/rooms`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setRooms([]); return
      }
      const b = await res.json()
      setRooms(b.rooms ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [buildingId, t])

  useEffect(() => { loadRooms() }, [loadRooms])

  const loadAssignments = useCallback(async (roomId: string) => {
    setPanelError(null); setPanelLoading(true)
    try {
      const res = await fetch(`/api/dormitory/rooms/${roomId}/assignments`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setPanelError(b.error ?? t('room.load_error')); setAssignments([]); return
      }
      const b = await res.json()
      setAssignments(b.assignments ?? [])
    } catch {
      setPanelError(t('room.load_error'))
    } finally {
      setPanelLoading(false)
    }
  }, [t])

  function selectRoom(r: Room) {
    setSelected(r)
    setQuery(''); setHits([]); setPicked(null); setFrom(''); setTo('')
    loadAssignments(r.id)
  }

  // student search for the picker
  useEffect(() => {
    if (!selected || picked) return
    const q = query.trim()
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/dormitory/students${q ? `?search=${encodeURIComponent(q)}` : ''}`)
        if (!res.ok) return
        const b = await res.json()
        if (!cancelled) setHits((b.students ?? []).slice(0, 8))
      } catch { /* ignore */ }
    }
    run()
    return () => { cancelled = true }
  }, [query, selected, picked])

  async function addRoom() {
    if (!roomNumber.trim() || !capacity.trim()) { setRoomError(t('form.required')); return }
    setBusy(true); setRoomError(null)
    try {
      const res = await fetch(`/api/dormitory/buildings/${buildingId}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: roomNumber.trim(),
          floor: floor.trim() === '' ? null : Number(floor),
          capacity: Number(capacity),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setRoomError(b.error ?? t('form.save_error')); return
      }
      setRoomNumber(''); setFloor(''); setCapacity(''); setShowRoomForm(false)
      await loadRooms()
    } catch {
      setRoomError(t('form.save_error'))
    } finally {
      setBusy(false)
    }
  }

  async function assign() {
    if (!selected || !picked || !from) { setPanelError(t('form.required')); return }
    setBusy(true); setPanelError(null)
    try {
      const res = await fetch(`/api/dormitory/rooms/${selected.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: picked.journey_id, assigned_from: from, assigned_to: to || null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setPanelError(b.error ?? t('room.assign_error')); return
      }
      setPicked(null); setQuery(''); setFrom(''); setTo('')
      await Promise.all([loadAssignments(selected.id), loadRooms()])
      // refresh selected occupancy from the reloaded list
    } catch {
      setPanelError(t('room.assign_error'))
    } finally {
      setBusy(false)
    }
  }

  async function endAssignment(a: RoomAssignment) {
    if (!selected) return
    if (!confirm(t('room.end_confirm'))) return
    setBusy(true); setPanelError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/dormitory/assignments/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', assigned_to: a.assigned_to ?? today }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setPanelError(b.error ?? t('room.action_error')); return
      }
      await Promise.all([loadAssignments(selected.id), loadRooms()])
    } catch {
      setPanelError(t('room.action_error'))
    } finally {
      setBusy(false)
    }
  }

  const totals = rooms.reduce((acc, r) => {
    acc.capacity += r.capacity; acc.occupied += r.occupied; return acc
  }, { capacity: 0, occupied: 0 })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('dormitory'), href: '/dashboard/dormitory' },
        { label: buildingName || '—' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('dormitory'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(6,182,212,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{buildingName}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            {t('list.occupied')}: {totals.occupied} / {totals.capacity} · {t('list.rooms')}: {rooms.length}
          </div>
        </div>
      </div>

      {/* Rooms section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('building.rooms_section')}</h2>
        {canManage && (
          <button onClick={() => setShowRoomForm(v => !v)} style={outlineBtn(primary)}>+ {t('building.add_room')}</button>
        )}
      </div>

      {showRoomForm && canManage && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder={t('form.room_number')} style={inp(120)} />
          <input value={floor} onChange={e => setFloor(e.target.value)} placeholder={t('form.floor')} type="number" style={inp(90)} />
          <input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder={t('form.capacity')} type="number" min="1" style={inp(110)} />
          <button onClick={addRoom} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
          {roomError && <span style={{ fontSize: 12, color: '#DC2626' }}>{roomError}</span>}
        </div>
      )}

      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : rooms.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('building.no_rooms')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {rooms.map(r => (
            <div
              key={r.id}
              onClick={() => selectRoom(r)}
              style={{
                background: 'var(--surface)', borderRadius: 10, padding: 14, cursor: 'pointer',
                border: `1px solid ${selected?.id === r.id ? primary : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.room_number}</span>
                {r.is_full
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>{t('room.full')}</span>
                  : <span style={{ fontSize: 10, fontWeight: 700, color: '#059669' }}>{t('list.free')}: {r.free}</span>}
              </div>
              {r.floor !== null && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{t('form.floor')}: {r.floor}</div>}
              <OccupancyBar occupied={r.occupied} capacity={r.capacity} color={primary} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{t('list.occupied')}: {r.occupied} / {r.capacity}</div>
            </div>
          ))}
        </div>
      )}

      {/* Selected room panel */}
      {selected && (
        <div style={{ background: 'var(--surface)', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {t('room.title')} {selected.room_number}
            </h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>

          {panelError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{panelError}</div>}

          {/* Assign form */}
          {canManage && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{t('room.assign_student')}</div>
              {picked ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: primary, background: getModuleColor('dormitory', 'light'), padding: '6px 10px', borderRadius: 8 }}>
                    {picked.full_name || picked.hebrew_name || picked.journey_id}
                    <button onClick={() => setPicked(null)} style={{ background: 'none', border: 'none', color: primary, cursor: 'pointer', marginInlineStart: 6 }}>✕</button>
                  </span>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp(150)} />
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} placeholder={t('form.to')} style={inp(150)} />
                  <button onClick={assign} disabled={busy} style={btn(primary)}>{t('room.assign')}</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('room.search_student')}
                    style={inp(320)}
                  />
                  {hits.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, width: 320, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      {hits.map(h => (
                        <div
                          key={h.journey_id}
                          onClick={() => { setPicked(h); setHits([]) }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--surface-2)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)' }}
                        >
                          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{h.full_name || h.hebrew_name || '—'}</div>
                          <div style={{ fontSize: 11, color: h.room ? '#D97706' : 'var(--text-faint)' }}>
                            {h.room ? `${h.room.building_name ?? ''} ${h.room.room_number ?? ''}`.trim() : t('room.unassigned')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Assignments list */}
          {panelLoading ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
          ) : assignments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('room.no_assignments')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[t('room.student'), t('form.from'), t('form.to'), t('room.status'), ''].map((h, i) => (
                      <th key={i} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={td}>{a.student_name || a.student_hebrew_name || '—'}</td>
                      <td style={td}>{a.assigned_from}</td>
                      <td style={td}>{a.assigned_to || '—'}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                          background: a.status === 'active' ? '#CFFAFE' : 'var(--surface-2)',
                          color: a.status === 'active' ? '#0E7490' : 'var(--text-muted)',
                        }}>
                          {t(`status.${a.status}`)}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canManage && a.status === 'active' && (
                          <button onClick={() => endAssignment(a)} disabled={busy} style={{ background: 'none', border: 'none', color: '#D97706', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            {t('room.end_assignment')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '9px 12px', borderBottom: '1px solid var(--surface-2)' }

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function outlineBtn(color: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer' }
}
