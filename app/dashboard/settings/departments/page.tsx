'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLang } from '@/lib/i18n/LanguageContext'

interface Department {
  id: string
  name: string
  parent_id: string | null
  head_person_id: string | null
  head_name: string | null
  employee_count: number
  created_at: string
}

interface TreeNode extends Department {
  children: TreeNode[]
}

const T = {
  ru: {
    title: 'Структура организации',
    addRoot: 'Добавить отдел',
    addChild: 'Подотдел',
    rename: 'Переименовать',
    delete: 'Удалить',
    employees: 'сотр.',
    head: 'Рук.',
    save: 'Сохранить',
    cancel: 'Отмена',
    deptName: 'Название отдела',
    newDept: 'Новый отдел',
    renameDept: 'Переименовать',
    confirmDelete: 'Удалить отдел? Дочерние отделы будут перенесены выше.',
    loading: 'Загрузка...',
    error: 'Ошибка загрузки',
    noDepts: 'Нет подразделений',
  },
  he: {
    title: 'מבנה ארגוני',
    addRoot: 'הוסף מחלקה',
    addChild: 'תת-מחלקה',
    rename: 'שנה שם',
    delete: 'מחק',
    employees: 'עובד.',
    head: 'ראש',
    save: 'שמור',
    cancel: 'בטל',
    deptName: 'שם מחלקה',
    newDept: 'מחלקה חדשה',
    renameDept: 'שנה שם',
    confirmDelete: 'למחוק מחלקה? תת-מחלקות יועברו למעלה.',
    loading: 'טוען...',
    error: 'שגיאת טעינה',
    noDepts: 'אין מחלקות',
  },
  en: {
    title: 'Organization Structure',
    addRoot: 'Add Department',
    addChild: 'Sub-dept',
    rename: 'Rename',
    delete: 'Delete',
    employees: 'emp.',
    head: 'Head',
    save: 'Save',
    cancel: 'Cancel',
    deptName: 'Department name',
    newDept: 'New Department',
    renameDept: 'Rename',
    confirmDelete: 'Delete department? Sub-departments will be moved up.',
    loading: 'Loading...',
    error: 'Load error',
    noDepts: 'No departments',
  },
}

function buildTree(depts: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const d of depts) map.set(d.id, { ...d, children: [] })
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

interface DeptModalProps {
  t: typeof T.ru
  initialName?: string
  title: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}

function DeptModal({ t, initialName = '', title, onClose, onSave }: DeptModalProps) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    await onSave(name.trim())
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{title}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.deptName}</span>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
            />
          </label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
          <button onClick={submit} disabled={saving || !name.trim()} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>{t.save}</button>
        </div>
      </div>
    </div>
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  t: typeof T.ru
  onAddChild: (parentId: string) => void
  onRename: (dept: Department) => void
  onDelete: (dept: Department) => void
}

function TreeRow({ node, depth, t, onAddChild, onRename, onDelete }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #F3F4F6' }}
        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F9FAFB' }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}
      >
        <td style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingInlineStart: depth * 20 }}>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ width: 18, height: 18, flexShrink: 0, background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginInlineEnd: 6 }}
            >
              {hasChildren && (
                <svg style={{ width: 12, height: 12, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: '#1F2937' }}>{node.name}</span>
          </div>
        </td>
        <td style={{ padding: '9px 14px', fontSize: 12, color: '#6B7280' }}>
          {node.head_name ? (
            <span>{t.head}: {node.head_name}</span>
          ) : (
            <span style={{ color: '#D1D5DB' }}>—</span>
          )}
        </td>
        <td style={{ padding: '9px 14px' }}>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, backgroundColor: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 500 }}>
            {node.employee_count} {t.employees}
          </span>
        </td>
        <td style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onAddChild(node.id)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}
            >
              + {t.addChild}
            </button>
            <button
              onClick={() => onRename(node)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151' }}
            >
              {t.rename}
            </button>
            <button
              onClick={() => onDelete(node)}
              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#FEF2F2', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}
            >
              {t.delete}
            </button>
          </div>
        </td>
      </tr>
      {expanded && node.children.map(child => (
        <TreeRow key={child.id} node={child} depth={depth + 1} t={t} onAddChild={onAddChild} onRename={onRename} onDelete={onDelete} />
      ))}
    </>
  )
}

export default function DepartmentsPage() {
  const { lang } = useLang()
  const t = T[lang] ?? T.ru

  const [depts, setDepts] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  type ModalState =
    | { type: 'add'; parentId: string | null }
    | { type: 'rename'; dept: Department }
    | null

  const [modal, setModal] = useState<ModalState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/departments')
    if (!res.ok) { setError(t.error); setLoading(false); return }
    setDepts(await res.json())
    setLoading(false)
  }, [t.error])

  useEffect(() => { load() }, [load])

  async function handleAdd(name: string, parentId: string | null) {
    await fetch('/api/settings/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId }),
    })
    setModal(null)
    load()
  }

  async function handleRename(name: string, id: string) {
    await fetch(`/api/settings/departments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setModal(null)
    load()
  }

  async function handleDelete(dept: Department) {
    if (!confirm(t.confirmDelete)) return
    await fetch(`/api/settings/departments/${dept.id}`, { method: 'DELETE' })
    load()
  }

  const tree = buildTree(depts)

  return (
    <div className="p-6 space-y-5">
      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', padding: '12px 24px' }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}>{t.title}</h1>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setModal({ type: 'add', parentId: null })}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#2D3170', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.addRoot}
        </button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t.loading}</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t.noDepts}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                {['Название', 'Руководитель', 'Сотрудники', 'Действия'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tree.map(node => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  t={t}
                  onAddChild={parentId => setModal({ type: 'add', parentId })}
                  onRename={dept => setModal({ type: 'rename', dept })}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.type === 'add' && (
        <DeptModal
          t={t}
          title={t.newDept}
          onClose={() => setModal(null)}
          onSave={name => handleAdd(name, modal.parentId)}
        />
      )}
      {modal?.type === 'rename' && (
        <DeptModal
          t={t}
          title={t.renameDept}
          initialName={modal.dept.name}
          onClose={() => setModal(null)}
          onSave={name => handleRename(name, modal.dept.id)}
        />
      )}
    </div>
  )
}
