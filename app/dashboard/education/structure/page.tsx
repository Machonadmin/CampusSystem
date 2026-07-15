'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

interface Unit { id: string; name: string }
interface Node { id: string; name: string; parent_id: string | null; is_root: boolean; groups: { id: string; name: string }[] }

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
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'he'))
    return m
  }, [nodes])
  const root = nodes.find(n => n.is_root) ?? null

  const addChild = async (parentId: string, name: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId, name }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return false }
      await load(unit); return true
    } finally { setBusy(false) }
  }
  const rename = async (nodeId: string, name: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/education/units/${unit}/structure/${nodeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
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
          <TreeNode node={root} depth={0} childrenOf={childrenOf} busy={busy}
            onAdd={addChild} onRename={rename} onRemove={remove} t={t} />
        </div>
      )}
    </div>
  )
}

function TreeNode({ node, depth, childrenOf, busy, onAdd, onRename, onRemove, t }: {
  node: Node; depth: number; childrenOf: Map<string | null, Node[]>; busy: boolean
  onAdd: (parentId: string, name: string) => Promise<boolean>
  onRename: (nodeId: string, name: string) => Promise<boolean>
  onRemove: (nodeId: string) => void
  t: (k: string, f?: string) => string
}) {
  const [adding, setAdding] = useState(false)
  const [addName, setAddName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)

  const kids = childrenOf.get(node.is_root ? '__root__' : node.id) ?? []

  return (
    <div style={{ marginInlineStart: depth > 0 ? 18 : 0, borderInlineStart: depth > 0 ? '2px solid var(--border)' : undefined, paddingInlineStart: depth > 0 ? 12 : 0, marginTop: depth > 0 ? 6 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 0' }}>
        {editing ? (
          <>
            <input value={editName} autoFocus onChange={e => setEditName(e.target.value)}
              onKeyDown={async e => { if (e.key === 'Enter' && editName.trim()) { if (await onRename(node.id, editName.trim())) setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
              style={{ padding: '5px 9px', fontSize: 13, border: '1px solid var(--accent)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }} />
            <button disabled={busy || !editName.trim()} onClick={async () => { if (await onRename(node.id, editName.trim())) setEditing(false) }} style={miniBtn('accent')}>{t('save')}</button>
            <button onClick={() => { setEditing(false); setEditName(node.name) }} style={miniBtn()}>{t('cancel')}</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 700 : 600, color: 'var(--text)' }}>
              {depth === 0 && '🏛️ '}{node.name}
            </span>
            {node.groups.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 99, padding: '1px 8px' }}>
                {node.groups.length} {t('groups')}
              </span>
            )}
            <button onClick={() => { setAdding(a => !a); setAddName('') }} style={miniBtn('accent')}>+ {t('add_child')}</button>
            {!node.is_root && <button onClick={() => { setEditing(true); setEditName(node.name) }} style={miniBtn()}>{t('rename')}</button>}
            {!node.is_root && <button disabled={busy} onClick={() => { if (confirm(t('confirm_delete'))) onRemove(node.id) }} style={miniBtn('danger')}>{t('delete')}</button>}
          </>
        )}
      </div>

      {node.groups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 4px' }}>
          {node.groups.map(g => (
            <span key={g.id} style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>📚 {g.name}</span>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}>
          <input value={addName} autoFocus onChange={e => setAddName(e.target.value)} placeholder={t('new_child_ph')}
            onKeyDown={async e => { if (e.key === 'Enter' && addName.trim()) { if (await onAdd(node.id, addName.trim())) { setAddName(''); setAdding(false) } } if (e.key === 'Escape') setAdding(false) }}
            style={{ padding: '5px 9px', fontSize: 13, border: '1px solid var(--accent)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', minWidth: 180 }} />
          <button disabled={busy || !addName.trim()} onClick={async () => { if (await onAdd(node.id, addName.trim())) { setAddName(''); setAdding(false) } }} style={miniBtn('accent')}>{t('add')}</button>
          <button onClick={() => setAdding(false)} style={miniBtn()}>{t('cancel')}</button>
        </div>
      )}

      {kids.map(k => (
        <TreeNode key={k.id} node={k} depth={depth + 1} childrenOf={childrenOf} busy={busy} onAdd={onAdd} onRename={onRename} onRemove={onRemove} t={t} />
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
