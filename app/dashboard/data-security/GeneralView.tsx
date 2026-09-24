'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import type { BuiltTree, TreeNode, CatalogEntry } from '@/lib/data-security/tree'
import { countPrivileges } from '@/lib/data-security/tree'
import type { UnitNode } from '@/lib/data-security/units'
import type { StaffSummary } from '@/lib/data-security/load'
import UnitsPanel from './UnitsPanel'
import {
  LevelBadge, RiskBadge, ScopeBadge, PrivilegeName, MissingDescription,
  AreaTile, BackToAreas, cardStyle, type T,
} from './shared'

// ─── Общий вид: здесь наводят порядок ────────────────────────────────────────
//
// Требование владельца: он должен уметь сам перетащить тему, разбить её и
// вынести в отдельный модуль — потому что «что означает каждая подчасть, знает
// тот, кто за неё отвечает», а не разработчик.
//
// Перетаскивание меняет ТОЛЬКО раскладку (security_tree_*). Права живут в
// других таблицах, и API дерева их не касается — это закреплено стражем
// lib/data-security/tree-isolation.test.ts. Поэтому на экране прямо написано:
// перестановка не меняет того, что кому разрешено.
//
// Доступность: одним перетаскиванием обойтись нельзя — у каждой строки есть
// кнопки «выше», «ниже» и «на уровень выше», работающие с клавиатуры.
//
// Раскрыт ровно ОДИН раздел за раз. Раньше открывалось всё дерево сразу, и
// владелец назвал это кашей — справедливо: 141 право на одном экране не
// охватывается взглядом. Плитки разделов при этом остаются на месте и служат
// целями броска, поэтому «вынести Туро из университета» по-прежнему делается
// одним перетаскиванием, а не становится недоступным из-за свёрнутого дерева.

interface Department { id: string; name: string }

interface DragPayload {
  kind: 'node' | 'item'
  id: string           // id узла либо 'module::code' права
  module?: string
  code?: string
}

export default function GeneralView({
  tree, units, staff, departments, canManageTree, canManageUnits, t, lang,
  onReload, onUnitsReload, onOpenPerson,
}: {
  tree: BuiltTree
  units: UnitNode[]
  staff: StaffSummary[]
  departments: Department[]
  canManageTree: boolean
  canManageUnits: boolean
  t: T
  lang: string
  onReload: (next: BuiltTree) => void
  onUnitsReload: (next: UnitNode[]) => void
  onOpenPerson: (personId: string) => void
}) {
  const [areaId, setAreaId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showUnits, setShowUnits] = useState(false)
  const [selected, setSelected] = useState<{ node: TreeNode; item: CatalogEntry | null } | null>(null)
  const [editing, setEditing] = useState<TreeNode | 'new' | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [showLegacy, setShowLegacy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const legacyCount = useMemo(() => {
    let n = 0
    const walk = (node: TreeNode) => {
      n += node.items.filter(i => i.isLegacy).length
      node.children.forEach(walk)
    }
    tree.roots.forEach(walk)
    n += tree.unassigned.filter(i => i.isLegacy).length
    return n
  }, [tree])

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const send = useCallback(async (url: string, init: RequestInit) => {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const body = await res.json().catch(() => null)
      if (!res.ok) { toastError(body?.error || t('save_error')); return false }
      onReload(body as BuiltTree)
      toastSuccess(t('saved'))
      return true
    } catch {
      toastError(t('save_error'))
      return false
    } finally { setBusy(false) }
  }, [onReload, t])

  const moveNode = (id: string, parentId: string | null, sortOrder: number) =>
    send('/api/data-security/tree', {
      method: 'PATCH',
      body: JSON.stringify({ moves: [{ kind: 'node', id, parent_id: parentId, sort_order: sortOrder }] }),
    })

  const moveItem = (module: string, code: string, nodeId: string, sortOrder: number) =>
    send('/api/data-security/tree', {
      method: 'PATCH',
      body: JSON.stringify({ moves: [{ kind: 'item', module, privilege_code: code, node_id: nodeId, sort_order: sortOrder }] }),
    })

  // ── Перетаскивание ────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, payload: DragPayload) => {
    if (!canManageTree) return
    e.dataTransfer.setData('application/json', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = async (e: React.DragEvent, targetNodeId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(null)
    if (!canManageTree) return
    let payload: DragPayload
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')) } catch { return }

    if (payload.kind === 'node') {
      if (payload.id === targetNodeId) return
      await moveNode(payload.id, targetNodeId, 0)
    } else if (payload.module && payload.code) {
      // Право обязано лежать в узле: бросок «в корень» для него бессмысленен.
      if (!targetNodeId) return
      await moveItem(payload.module, payload.code, targetNodeId, 0)
    }
  }

  const allowDrop = (e: React.DragEvent, id: string) => {
    if (!canManageTree) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(id)
  }

  // ── Клавиатурные перемещения (без мыши) ───────────────────────────────────
  const siblingsOf = (node: TreeNode): TreeNode[] => {
    if (!node.parentId) return tree.roots
    const find = (list: TreeNode[]): TreeNode[] | null => {
      for (const n of list) {
        if (n.id === node.parentId) return n.children
        const deeper = find(n.children)
        if (deeper) return deeper
      }
      return null
    }
    return find(tree.roots) ?? tree.roots
  }

  const nudge = async (node: TreeNode, delta: -1 | 1) => {
    const sibs = siblingsOf(node)
    const idx = sibs.findIndex(s => s.id === node.id)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= sibs.length) return
    await send('/api/data-security/tree', {
      method: 'PATCH',
      body: JSON.stringify({
        moves: [
          { kind: 'node', id: node.id, parent_id: node.parentId, sort_order: sibs[target].sortOrder },
          { kind: 'node', id: sibs[target].id, parent_id: sibs[target].parentId, sort_order: node.sortOrder },
        ],
      }),
    })
  }

  const parentOf = (node: TreeNode): TreeNode | null => {
    const find = (list: TreeNode[]): TreeNode | null => {
      for (const n of list) {
        if (n.children.some(c => c.id === node.id)) return n
        const deeper = find(n.children)
        if (deeper) return deeper
      }
      return null
    }
    return find(tree.roots)
  }

  const moveOut = async (node: TreeNode) => {
    const parent = parentOf(node)
    await moveNode(node.id, parent?.parentId ?? null, node.sortOrder)
  }

  const removeNode = async (node: TreeNode) => {
    if (node.moduleCode) { toastError(t('delete_module_root_error')); return }
    if (!(await confirmDialog({ message: t('delete_node_confirm'), tone: 'danger' }))) return
    await send(`/api/data-security/tree/node?id=${encodeURIComponent(node.id)}`, { method: 'DELETE' })
  }

  // ── Поиск ─────────────────────────────────────────────────────────────────
  // Не фильтр по дереву, а отдельный плоский список: когда ищут конкретное
  // право, разделы только мешают, а обрезанное дерево ещё и вводит в
  // заблуждение — непонятно, что скрыто, а чего просто нет.
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: { node: TreeNode; item: CatalogEntry }[] = []
    const walk = (node: TreeNode) => {
      for (const item of node.items) {
        if (!showLegacy && item.isLegacy) continue
        const hay = `${item.name ?? ''} ${item.description ?? ''} ${node.name ?? ''}`.toLowerCase()
        if (hay.includes(q)) hits.push({ node, item })
      }
      node.children.forEach(walk)
    }
    tree.roots.forEach(walk)
    return hits.slice(0, 80)
  }, [query, tree.roots, showLegacy])

  const area = useMemo(
    () => (areaId ? tree.roots.find(r => r.id === areaId) ?? null : null),
    [areaId, tree.roots],
  )

  const visibleItems = (node: TreeNode) => node.items.filter(i => showLegacy || !i.isLegacy)

  // ── Отрисовка ─────────────────────────────────────────────────────────────
  const renderItem = (node: TreeNode, item: CatalogEntry, depth: number) => {
    const key = `${item.module}::${item.code}`
    const isSelected = selected?.item?.module === item.module && selected?.item?.code === item.code
    return (
      <div
        key={key}
        draggable={canManageTree}
        onDragStart={e => onDragStart(e, { kind: 'item', id: key, module: item.module, code: item.code })}
        onClick={() => setSelected({ node, item })}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected({ node, item }) } }}
        className="ds-row"
        style={{
          padding: '8px 12px',
          paddingInlineStart: 12 + Math.min(depth, 3) * 16 + 22,
          borderRadius: 8,
          cursor: canManageTree ? 'grab' : 'pointer',
          background: isSelected ? 'var(--accent-tint)' : 'transparent',
          opacity: item.isLegacy ? 0.65 : 1,
        }}
      >
        {canManageTree && <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 12 }}>⠿</span>}
        <span className="ds-grow" style={{ fontSize: 13, color: 'var(--text)' }}>
          <PrivilegeName name={item.name} t={t} />
        </span>
        {item.isLegacy && (
          <span style={{
            padding: '2px 7px', borderRadius: 5, background: 'var(--surface-2)',
            color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700,
          }}>{t('legacy_badge')}</span>
        )}
        {!item.description && <MissingDescription t={t} />}
        <RiskBadge risk={item.risk} t={t} />
        <LevelBadge level={item.level} t={t} />
      </div>
    )
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const open = expanded.has(node.id)
    const items = visibleItems(node)
    const accent = node.color || (node.moduleCode ? getModuleColor(node.moduleCode) : 'var(--text-muted)')

    return (
      <div key={node.id}>
        <div
          draggable={canManageTree}
          onDragStart={e => onDragStart(e, { kind: 'node', id: node.id })}
          onDragOver={e => allowDrop(e, node.id)}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => onDrop(e, node.id)}
          className="ds-row"
          style={{
            padding: '9px 12px',
            paddingInlineStart: 12 + Math.min(depth, 3) * 16,
            borderRadius: 9,
            background: dragOver === node.id ? 'var(--accent-tint)' : 'transparent',
            borderInlineStart: `3px solid ${depth === 0 ? accent : 'var(--border)'}`,
          }}
        >
          {canManageTree && <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 12 }}>⠿</span>}

          <button
            onClick={() => toggle(node.id)}
            aria-expanded={open}
            style={{
              border: 0, background: 'none', cursor: 'pointer', padding: '2px 4px',
              color: 'var(--text-muted)', fontSize: 11,
            }}
          >{open ? '▾' : '◂'}</button>

          <button
            onClick={() => setSelected({ node, item: null })}
            className="ds-grow"
            style={{
              border: 0, background: 'none', cursor: 'pointer',
              textAlign: 'start', padding: 0,
              fontSize: depth === 0 ? 14 : 13.5,
              fontWeight: depth === 0 ? 700 : 600,
              color: 'var(--text)', overflowWrap: 'anywhere',
            }}
          >
            {node.name ?? <PrivilegeName name={null} t={t} />}
          </button>

          {node.departmentId && (
            <ScopeBadge
              scope="department"
              departments={[departments.find(d => d.id === node.departmentId)?.name ?? '']}
              t={t}
            />
          )}

          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {t('privileges_count').replace('{n}', String(countPrivileges(node)))}
          </span>

          {canManageTree && (
            <span style={{ display: 'flex', gap: 2 }}>
              <IconBtn label={t('move_up')} onClick={() => nudge(node, -1)} disabled={busy}>↑</IconBtn>
              <IconBtn label={t('move_down')} onClick={() => nudge(node, 1)} disabled={busy}>↓</IconBtn>
              {node.parentId && (
                <IconBtn label={t('move_out')} onClick={() => moveOut(node)} disabled={busy}>⇤</IconBtn>
              )}
              <IconBtn label={t('edit_node')} onClick={() => setEditing(node)} disabled={busy}>✎</IconBtn>
              {!node.moduleCode && (
                <IconBtn label={t('delete_node')} onClick={() => removeNode(node)} disabled={busy}>✕</IconBtn>
              )}
            </span>
          )}
        </div>

        {open && (
          <div>
            {items.map(i => renderItem(node, i, depth))}
            {node.children.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const areaAccent = (root: TreeNode) =>
    root.color || (root.moduleCode ? getModuleColor(root.moduleCode) : 'var(--border)')

  return (
    <div className={selected ? 'ds-split-rev' : undefined}>
      <div style={{ minWidth: 0 }}>
        {/* Единицы задают ГРАНИЦЫ, внутри которых действуют права, поэтому они
            наверху. Но открыты не всегда: постоянно развёрнутое дерево единиц
            было половиной того «слишком много», о котором сказал владелец. */}
        <button
          onClick={() => setShowUnits(v => !v)}
          aria-expanded={showUnits}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '11px 14px', marginBottom: 12, borderRadius: 11,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', textAlign: 'start',
          }}
        >
          <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 11 }}>{showUnits ? '▾' : '◂'}</span>
          <span style={{ flexGrow: 1 }}>{t('units_title')}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>
            {showUnits ? t('units_hide') : t('units_show')}
          </span>
        </button>
        {showUnits && (
          <div className="anim-expand">
            <UnitsPanel
              units={units}
              staff={staff}
              canManageUnits={canManageUnits}
              t={t}
              onReload={onUnitsReload}
              onOpenPerson={onOpenPerson}
            />
          </div>
        )}

        <div className="ds-row" style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('search_privilege')}
            aria-label={t('search_privilege')}
            className="ds-grow"
            style={{
              padding: '9px 13px', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 13,
            }}
          />
          {legacyCount > 0 && (
            <button
              onClick={() => setShowLegacy(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              {t('legacy_hidden').replace('{n}', String(legacyCount))} · {showLegacy ? t('legacy_hide') : t('legacy_show')}
            </button>
          )}
          {canManageTree && (
            <button
              onClick={() => setEditing('new')}
              style={{
                padding: '8px 16px', borderRadius: 9, border: 0,
                background: getModuleColor('data_security'), color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >+ {t('new_node')}</button>
          )}
        </div>

        {query.trim() ? (
          /* Поиск: плоский список по всем разделам. */
          <>
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--text-muted)' }}>{t('search_results')}</p>
            <div style={{ ...cardStyle, padding: '6px 8px' }}>
              {searchHits.length === 0 ? (
                <p style={{ margin: 0, padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                  {t('no_results')}
                </p>
              ) : searchHits.map(h => renderItem(h.node, h.item, 0))}
            </div>
          </>
        ) : (
          <>
            {/* Плитки разделов видны всегда: это и навигация, и цель броска —
                перетащить узел на чужой раздел значит перенести его туда. */}
            <div className="ds-tiles" style={{ marginBottom: 14 }}>
              {tree.roots.map(root => (
                <AreaTile
                  key={root.id}
                  name={root.name ?? ''}
                  accent={areaAccent(root)}
                  caption={t('privileges_count').replace('{n}', String(countPrivileges(root)))}
                  active={root.id === areaId}
                  onClick={() => {
                    // Открытый раздел сразу разворачивается: иначе клик по
                    // плитке приводил бы к свёрнутой строке и выглядел поломкой.
                    const next = areaId === root.id ? null : root.id
                    setAreaId(next)
                    if (next) setExpanded(prev => new Set(prev).add(next))
                  }}
                  dropActive={dragOver === `tile-${root.id}`}
                  onDragOver={canManageTree ? (e => allowDrop(e, `tile-${root.id}`)) : undefined}
                  onDragLeave={canManageTree ? (() => setDragOver(null)) : undefined}
                  onDrop={canManageTree ? (e => onDrop(e, root.id)) : undefined}
                />
              ))}
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>
              {canManageTree ? (area ? t('general_hint') : t('area_pick_general')) : t('no_tree_permission')}
            </p>

            {area && (
              <div className="anim-expand">
                <div className="ds-row" style={{ marginBottom: 10 }}>
                  <BackToAreas label={t('back_to_areas')} onClick={() => setAreaId(null)} />
                  <h3 className="ds-grow" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    {area.name}
                  </h3>
                </div>

                {/* Полоса «вынести в отдельный раздел»: бросок сюда делает узел корневым. */}
                {canManageTree && (
                  <div
                    onDragOver={e => allowDrop(e, '__root__')}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => onDrop(e, null)}
                    style={{
                      padding: '10px 14px', marginBottom: 10, borderRadius: 9,
                      border: `1.5px dashed ${dragOver === '__root__' ? 'var(--accent)' : 'var(--border)'}`,
                      background: dragOver === '__root__' ? 'var(--accent-tint)' : 'transparent',
                      color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center',
                    }}
                  >{t('make_root')}</div>
                )}

                <div style={{ ...cardStyle, padding: '10px 8px' }}>
                  {renderNode(area, 0)}
                </div>
              </div>
            )}
          </>
        )}

        {tree.unassigned.length > 0 && (
          <details style={{ ...cardStyle, padding: '12px 14px', marginTop: 14, borderInlineStart: '3px solid var(--warn)' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
              {t('unassigned')} · {tree.unassigned.length}
            </summary>
            <p style={{ margin: '8px 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>{t('unassigned_hint')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tree.unassigned.filter(i => showLegacy || !i.isLegacy).map(i => (
                <span
                  key={`${i.module}::${i.code}`}
                  draggable={canManageTree}
                  onDragStart={e => onDragStart(e, { kind: 'item', id: `${i.module}::${i.code}`, module: i.module, code: i.code })}
                  style={{
                    padding: '5px 11px', borderRadius: 7, background: 'var(--surface-2)',
                    color: 'var(--text)', fontSize: 12.5, cursor: canManageTree ? 'grab' : 'default',
                    overflowWrap: 'anywhere',
                  }}
                ><PrivilegeName name={i.name} t={t} /></span>
              ))}
            </div>
          </details>
        )}
      </div>

      {selected && (
        <DetailPanel
          node={selected.node}
          item={selected.item}
          departments={departments}
          onClose={() => setSelected(null)}
          t={t}
          lang={lang}
        />
      )}

      {editing && (
        <NodeEditor
          node={editing === 'new' ? null : editing}
          departments={departments}
          t={t}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            const ok = editing === 'new'
              ? await send('/api/data-security/tree/node', { method: 'POST', body: JSON.stringify(payload) })
              : await send('/api/data-security/tree/node', { method: 'PATCH', body: JSON.stringify({ ...payload, id: editing.id }) })
            if (ok) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function IconBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
        background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12,
        cursor: disabled ? 'default' : 'pointer', lineHeight: 1,
      }}
    >{children}</button>
  )
}

// ─── Карточка выбранного узла или права ──────────────────────────────────────
function DetailPanel({ node, item, departments, onClose, t, lang }: {
  node: TreeNode
  item: CatalogEntry | null
  departments: Department[]
  onClose: () => void
  t: T
  lang: string
}) {
  const [holders, setHolders] = useState<{ roles: string[]; people: string[] } | null>(null)
  const [showTech, setShowTech] = useState(false)

  // Именно useEffect: это загрузка, а не вычисление. useMemo с setState
  // выполнился бы во время рендера и в StrictMode сработал бы дважды.
  useEffect(() => {
    if (!item) { setHolders(null); return }
    fetch(`/api/data-security/holders?module=${encodeURIComponent(item.module)}&code=${encodeURIComponent(item.code)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHolders(d))
      .catch(() => setHolders(null))
  }, [item])

  const dept = node.departmentId ? departments.find(d => d.id === node.departmentId) : null

  return (
    <aside className="ds-sticky" style={{ ...cardStyle, padding: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <h2 style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
          {item ? <PrivilegeName name={item.name} t={t} /> : (node.name ?? '')}
        </h2>
        <button onClick={onClose} aria-label="×" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>×</button>
      </div>

      <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>{node.name}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
        {item && <LevelBadge level={item.level} t={t} />}
        {item && <RiskBadge risk={item.risk} t={t} />}
        {dept && <ScopeBadge scope="department" departments={[dept.name]} t={t} />}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
        {(item ? item.description : node.description) ?? <MissingDescription t={t} />}
      </p>

      {item?.isLegacy && item.supersededBy && (
        <p style={{ margin: '12px 0 0', padding: '9px 11px', borderRadius: 8, background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-muted)' }}>
          {t('superseded_by').replace('{name}', item.supersededBy)}
        </p>
      )}

      {item && holders && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 7px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>{t('holders')}</p>
          {holders.roles.length === 0 && holders.people.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{t('holders_none')}</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {holders.roles.map(r => (
                <span key={`r-${r}`} style={{ padding: '4px 10px', borderRadius: 7, background: 'var(--surface-2)', fontSize: 12, color: 'var(--text)' }}>{r}</span>
              ))}
              {holders.people.map(p => (
                <span key={`p-${p}`} style={{ padding: '4px 10px', borderRadius: 7, background: 'var(--success-tint)', fontSize: 12, color: 'var(--success)' }}>{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <p style={{ margin: '16px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {t('audit_note')}
      </p>

      {/* Технический код — только здесь, свёрнутым, для поддержки. На самом
          экране его нет нигде: администратору он ничего не объясняет. */}
      {item && (
        <details open={showTech} onToggle={e => setShowTech((e.target as HTMLDetailsElement).open)} style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--text-muted)' }}>{t('technical_details')}</summary>
          <code style={{
            display: 'inline-block', marginTop: 7, padding: '3px 8px', borderRadius: 6,
            background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 11.5,
          }}>{item.module}.{item.code}</code>
          <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            {lang === 'he' ? 'לתמיכה בלבד' : lang === 'en' ? 'For support only' : 'Только для поддержки'}
          </span>
        </details>
      )}
    </aside>
  )
}

// ─── Создание и правка узла ──────────────────────────────────────────────────
function NodeEditor({ node, departments, t, busy, onClose, onSave }: {
  node: TreeNode | null
  departments: Department[]
  t: T
  busy: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState({
    name_he: node?.name ?? '',
    name_ru: '',
    name_en: '',
    description_he: node?.description ?? '',
    description_ru: '',
    description_en: '',
    department_id: node?.departmentId ?? '',
  })
  const [err, setErr] = useState('')

  const field = (key: keyof typeof form, label: string, area = false) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      {area ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={2}
          style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />
      ) : (
        <input
          type="text"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        />
      )}
    </label>
  )

  return (
    // panelStyle с отступом — то, как Modal используется везде в проекте
    // (ClassGroupModal, AcceptanceOverviewTab): сам Modal внутреннего padding не
    // задаёт. Без него подписи полей упирались в край панели, и на телефоне
    // форма читалась как обрезанная — владелец прислал ровно этот снимок.
    <Modal
      onClose={onClose}
      maxWidth={520}
      ariaLabel={node ? t('edit_node') : t('new_node_title')}
      panelStyle={{ padding: 20 }}
    >
      <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
        {node ? t('edit_node') : t('new_node_title')}
      </h2>

      {field('name_he', t('name_he'))}
      {field('name_ru', t('name_ru'))}
      {field('name_en', t('name_en'))}
      {field('description_he', t('desc_he'), true)}
      {field('description_ru', t('desc_ru'), true)}
      {field('description_en', t('desc_en'), true)}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('link_department')}</span>
        <select
          value={form.department_id}
          onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
          style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        >
          <option value="">{t('no_department')}</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      {err && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--danger)' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <SubmitButton
          loading={busy}
          onClick={() => {
            if (!form.name_he.trim()) { setErr(t('name_he_required')); return }
            setErr('')
            onSave({ ...form, department_id: form.department_id || null })
          }}
          style={{ flexGrow: 1, padding: '11px 0', borderRadius: 9, border: 0, background: getModuleColor('data_security'), color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >{t('save')}</SubmitButton>
      </div>
    </Modal>
  )
}
