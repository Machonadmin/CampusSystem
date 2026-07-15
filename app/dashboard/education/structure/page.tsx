'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

interface Unit { id: string; name: string }
interface Node { id: string; name: string; tier: string | null; sort_order: number; parent_id: string | null; is_root: boolean; groups: { id: string; name: string }[] }

export default function StructurePage() {
  const t = useTranslations('education.structure')
  const tNav = useTranslations('navigation')

  const [units, setUnits] = useState<Unit[]>([])
  const [unit, setUnit] = useState('')
  const [nodes, setNodes] = useState<Node[]>([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/education/units')
        if (res.ok) { const b = await res.json(); const us: Unit[] = b.units ?? []; setUnits(us); if (us.length) setUnit(us[0].id) }
      } finally { setLoadingUnits(false) }
    })()
  }, [])

  const load = useCallback(async (u: string) => {
    if (!u) { setNodes([]); return }
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${u}/structure`)
      if (res.ok) { const b = await res.json(); setNodes(b.nodes ?? []) }
      else setNodes([])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(unit) }, [unit, load])

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Node[]>()
    for (const n of nodes) { const k = n.is_root ? '__root__' : n.parent_id; const arr = m.get(k) ?? []; arr.push(n); m.set(k, arr) }
    for (const arr of m.values()) arr.sort((a, b) => (a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name, 'he')))
    return m
  }, [nodes])
  const root = nodes.find(n => n.is_root) ?? null

  const addChild = async (parentId: string, name: string, tier: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId, name, tier }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return false }
      await load(unit); return true
    } finally { setBusy(false) }
  }
  const rename = async (nodeId: string, name: string, tier: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure/${nodeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, tier }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return false }
      await load(unit); return true
    } finally { setBusy(false) }
  }
  const remove = async (nodeId: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure/${nodeId}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      await load(unit)
    } finally { setBusy(false) }
  }
  const move = async (nodeId: string, direction: 'up' | 'down') => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure/${nodeId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      await load(unit)
    } finally { setBusy(false) }
  }
  const moveGroup = async (groupId: string, targetNodeId: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure/move-group`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: groupId, target_node_id: targetNodeId }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      await load(unit)
    } finally { setBusy(false) }
  }

  const nodeOptions = useMemo(
    () => nodes.map(n => ({ id: n.id, label: (n.tier ? `${n.tier} · ` : '') + n.name })),
    [nodes],
  )

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={unit} onChange={e => setUnit(e.target.value)} disabled={loadingUnits || units.length === 0}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
          {units.length === 0 && <option value="">{loadingUnits ? '…' : t('no_units')}</option>}
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : !root ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_units')}</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <TreeNode node={root} depth={0} index={0} siblingCount={1} childrenOf={childrenOf} busy={busy}
            onAdd={addChild} onRename={rename} onRemove={remove} onMove={move} onMoveGroup={moveGroup} nodeOptions={nodeOptions} t={t} />
        </div>
      )}
    </div>
  )
}

function TreeNode({ node, depth, index, siblingCount, childrenOf, busy, onAdd, onRename, onRemove, onMove, onMoveGroup, nodeOptions, t }: {
  node: Node; depth: number; index: number; siblingCount: number; childrenOf: Map<string | null, Node[]>; busy: boolean
  onAdd: (parentId: string, name: string, tier: string) => Promise<boolean>
  onRename: (nodeId: string, name: string, tier: string) => Promise<boolean>
  onRemove: (nodeId: string) => void
  onMove: (nodeId: string, direction: 'up' | 'down') => void
  onMoveGroup: (groupId: string, targetNodeId: string) => void
  nodeOptions: { id: string; label: string }[]
  t: (k: string, f?: string) => string
}) {
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState('')
  const [addTier, setAddTier] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editTier, setEditTier] = useState(node.tier ?? '')

  const kids = childrenOf.get(node.is_root ? '__root__' : node.id) ?? []

  return (
    <div style={{ marginInlineStart: depth > 0 ? 18 : 0, borderInlineStart: depth > 0 ? '2px solid var(--border)' : undefined, paddingInlineStart: depth > 0 ? 12 : 0, marginTop: depth > 0 ? 6 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 0' }}>
        {editing ? (
          <>
            <input value={editName} autoFocus onChange={e => setEditName(e.target.value)}
              onKeyDown={async e => { if (e.key === 'Enter' && editName.trim()) { if (await onRename(node.id, editName.trim(), editTier.trim())) setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
              style={{ padding: '5px 9px', fontSize: 13, border: '1px solid var(--accent)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }} />
            <input value={editTier} onChange={e => setEditTier(e.target.value)} placeholder={t('tier_ph')}
              style={{ padding: '5px 9px', fontSize: 12.5, width: 96, border: '1px solid var(--border-strong)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }} />
            <button disabled={busy || !editName.trim()} onClick={async () => { if (await onRename(node.id, editName.trim(), editTier.trim())) setEditing(false) }} style={miniBtn('accent')}>{t('save')}</button>
            <button onClick={() => { setEditing(false); setEditName(node.name); setEditTier(node.tier ?? '') }} style={miniBtn()}>{t('cancel')}</button>
          </>
        ) : (
          <>
            {node.tier && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 99, padding: '1px 8px' }}>{node.tier}</span>
            )}
            <span style={{ fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 700 : 600, color: 'var(--text)' }}>
              {depth === 0 && '🏛️ '}{node.name}
            </span>
            {node.groups.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 99, padding: '1px 8px' }}>
                {node.groups.length} {t('groups')}
              </span>
            )}
            <button onClick={() => { setAdding(a => !a); setAddName('') }} style={miniBtn('accent')}>+ {t('add_child')}</button>
            {!node.is_root && index > 0 && <button disabled={busy} title={t('move_up')} onClick={() => onMove(node.id, 'up')} style={miniBtn()}>↑</button>}
            {!node.is_root && index < siblingCount - 1 && <button disabled={busy} title={t('move_down')} onClick={() => onMove(node.id, 'down')} style={miniBtn()}>↓</button>}
            {!node.is_root && <button onClick={() => { setEditing(true); setEditName(node.name) }} style={miniBtn()}>{t('rename')}</button>}
            {!node.is_root && <button disabled={busy} onClick={() => { if (confirm(t('confirm_delete'))) onRemove(node.id) }} style={miniBtn('danger')}>{t('delete')}</button>}
          </>
        )}
      </div>

      {node.groups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 4px' }}>
          {node.groups.map(g => (
            <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px 2px 8px' }}>
              📚 {g.name}
              <select value="" disabled={busy} title={t('move_group')} onChange={e => { if (e.target.value) onMoveGroup(g.id, e.target.value) }}
                style={{ fontSize: 10.5, border: '1px solid var(--border-strong)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text-muted)', padding: '0 2px', cursor: 'pointer' }}>
                <option value="">⇄</option>
                {nodeOptions.filter(o => o.id !== node.id).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', flexWrap: 'wrap' }}>
          <input value={addName} autoFocus onChange={e => setAddName(e.target.value)} placeholder={t('new_child_ph')}
            onKeyDown={async e => { if (e.key === 'Enter' && addName.trim()) { if (await onAdd(node.id, addName.trim(), addTier.trim())) { setAddName(''); setAddTier(''); setAdding(false) } } if (e.key === 'Escape') setAdding(false) }}
            style={{ padding: '5px 9px', fontSize: 13, border: '1px solid var(--accent)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', minWidth: 180 }} />
          <input value={addTier} onChange={e => setAddTier(e.target.value)} placeholder={t('tier_ph')}
            style={{ padding: '5px 9px', fontSize: 12.5, width: 96, border: '1px solid var(--border-strong)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }} />
          <button disabled={busy || !addName.trim()} onClick={async () => { if (await onAdd(node.id, addName.trim(), addTier.trim())) { setAddName(''); setAddTier(''); setAdding(false) } }} style={miniBtn('accent')}>{t('add')}</button>
          <button onClick={() => setAdding(false)} style={miniBtn()}>{t('cancel')}</button>
        </div>
      )}

      {kids.map((k, ki) => (
        <TreeNode key={k.id} node={k} depth={depth + 1} index={ki} siblingCount={kids.length} childrenOf={childrenOf} busy={busy} onAdd={onAdd} onRename={onRename} onRemove={onRemove} onMove={onMove} onMoveGroup={onMoveGroup} nodeOptions={nodeOptions} t={t} />
      ))}
    </div>
  )
}

function miniBtn(kind?: 'accent' | 'danger'): React.CSSProperties {
  const color = kind === 'accent' ? 'var(--accent-strong)' : kind === 'danger' ? 'var(--danger)' : 'var(--text-muted)'
  const bg = kind === 'accent' ? 'var(--accent-tint)' : kind === 'danger' ? 'var(--danger-tint)' : 'var(--surface)'
  const border = kind === 'accent' ? 'var(--accent)' : kind === 'danger' ? 'var(--danger)' : 'var(--border-strong)'
  return { padding: '3px 9px', fontSize: 11.5, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, borderRadius: 6, cursor: 'pointer' }
}
