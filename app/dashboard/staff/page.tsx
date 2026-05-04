'use client'

import { useEffect, useState, useCallback } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useLang } from '@/lib/i18n/LanguageContext'
import AddEmployeeModal from './components/AddEmployeeModal'

interface Department {
  id: string
  name: string
  parent_id: string | null
  head_name: string | null
  employee_count: number
  sort_order?: number
  description?: string | null
}

interface TreeNode extends Department { children: TreeNode[] }

interface StaffMember {
  id: string
  person_id: string
  full_name: string
  position_ru: string
  is_head: boolean
  employment_type: string | null
}

const EMP_LABELS: Record<string, string> = {
  staff: 'Штат', intern: 'Стажёр', volunteer: 'Волонтёр', contractor: 'Подрядчик',
}

function buildTree(depts: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const d of depts) map.set(d.id, { ...d, children: [] })
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node)
    else roots.push(node)
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    nodes.forEach(n => sort(n.children))
  }
  sort(roots)
  return roots
}

// ── Shared input styles ───────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

// ── Dept add modal ────────────────────────────────────────────────────────────

function DeptAddModal({ depts, parentId, onClose, onSaved }: {
  depts: Department[]
  parentId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [selectedParent, setSelectedParent] = useState(parentId ?? '')
  const [sortOrder, setSortOrder] = useState('0')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  type D = Department & { children: D[] }
  const map2 = new Map<string, D>()
  for (const d of depts) map2.set(d.id, { ...d, children: [] })
  const roots2: D[] = []
  for (const node of map2.values()) {
    if (node.parent_id && map2.has(node.parent_id)) map2.get(node.parent_id)!.children.push(node)
    else roots2.push(node)
  }
  const parentOptions: { id: string; label: string }[] = []
  function walkParents(node: D, depth: number) {
    parentOptions.push({ id: node.id, label: '  '.repeat(depth) + node.name })
    node.children.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => walkParents(c, depth + 1))
  }
  roots2.sort((a, b) => a.name.localeCompare(b.name)).forEach(r => walkParents(r, 0))

  async function save() {
    if (!name.trim()) { setErr('Название обязательно'); return }
    setSaving(true)
    const res = await fetch('/api/settings/departments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parent_id: selectedParent || null, sort_order: Number(sortOrder) || 0, description: description.trim() || null }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937', margin: 0 }}>Новый отдел</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Название (рус.) *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="Бухгалтерия" style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
            <div>
              <label style={lbl}>Родительский отдел</label>
              <select value={selectedParent} onChange={e => setSelectedParent(e.target.value)} style={inp}>
                <option value="">Нет (корневой отдел)</option>
                {parentOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sort order</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Описание отдела</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical' }} placeholder="Краткое описание..." />
          </div>
          {err && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Отмена</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ padding: '7px 20px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dept rename modal ─────────────────────────────────────────────────────────

function DeptRenameModal({ node, onClose, onSaved }: { node: TreeNode; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(node.name)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    await fetch(`/api/settings/departments/${node.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
    })
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937', margin: 0 }}>Переименовать отдел</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} style={inp} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Отмена</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Staff position edit modal ─────────────────────────────────────────────────

function StaffPositionEditModal({ member, onClose, onSaved }: {
  member: StaffMember
  onClose: () => void
  onSaved: () => void
}) {
  const [position, setPosition] = useState(member.position_ru)
  const [empType, setEmpType] = useState(member.employment_type ?? 'staff')
  const [isHead, setIsHead] = useState(member.is_head)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!position.trim()) { setErr('Должность обязательна'); return }
    setSaving(true)
    const res = await fetch(`/api/staff/positions/${member.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_ru: position.trim(), employment_type: empType, is_head: isHead }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937', margin: 0 }}>Изменить должность</p>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>{member.full_name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Должность *</label>
            <input autoFocus value={position} onChange={e => setPosition(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Тип занятости</label>
            <select value={empType} onChange={e => setEmpType(e.target.value)} style={inp}>
              <option value="staff">Штат</option>
              <option value="part_time">Частичная ставка</option>
              <option value="intern">Стажёр</option>
              <option value="volunteer">Волонтёр</option>
              <option value="contractor">Подрядчик</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} style={{ accentColor: '#3B82F6' }} />
            Руководитель отдела
          </label>
          {err && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Отмена</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tree row ──────────────────────────────────────────────────────────────────

function TreeRow({ node, depth, depts, onAddChild, onRename, onDelete, onAddStaff, refreshSignal }: {
  node: TreeNode; depth: number; depts: Department[]
  onAddChild: (id: string) => void
  onRename: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onAddStaff: (id: string) => void
  refreshSignal: number
}) {
  const [expanded, setExpanded] = useState(true)
  const [staffOpen, setStaffOpen] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null)

  useEffect(() => {
    if (!staffOpen) return
    setStaffLoading(true)
    fetch(`/api/settings/departments/${node.id}/staff`)
      .then(r => r.ok ? r.json() : [])
      .then((d: StaffMember[]) => { setStaff(d); setStaffLoading(false) })
  }, [staffOpen, node.id, refreshSignal])

  async function deactivateMember(member: StaffMember) {
    if (!confirm(`Деактивировать "${member.full_name}" (${member.position_ru})?\n\nСотрудник будет скрыт из списка, данные сохранятся.`)) return
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/staff/positions/${member.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_date: today }),
    })
    if (res.ok) setStaff(prev => prev.filter(s => s.id !== member.id))
  }

  const btnBase: React.CSSProperties = { padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }

  return (
    <>
      <tr style={{ borderBottom: '1px solid #F3F4F6' }}
        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F9FAFB' }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}>

        <td style={{ padding: '7px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingInlineStart: depth * 18 }}>
            <button onClick={() => setExpanded(v => !v)}
              style={{ width: 16, height: 16, flexShrink: 0, background: 'none', border: 'none', cursor: node.children.length ? 'pointer' : 'default', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginInlineEnd: 5 }}>
              {node.children.length > 0 && (
                <svg style={{ width: 10, height: 10, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: '#1F2937' }}>{node.name}</span>
          </div>
        </td>

        <td style={{ padding: '7px 12px', fontSize: 12, color: '#6B7280' }}>
          {node.head_name ?? <span style={{ color: '#D1D5DB' }}>—</span>}
        </td>

        <td style={{ padding: '7px 12px' }}>
          <button onClick={() => setStaffOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10, backgroundColor: staffOpen ? '#DBEAFE' : '#F3F4F6', color: staffOpen ? '#1D4ED8' : '#6B7280', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            {node.employee_count} сотр.
            <svg style={{ width: 9, height: 9, transform: staffOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </td>

        <td style={{ padding: '7px 12px' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => onAddStaff(node.id)}
              style={{ ...btnBase, border: 'none', background: '#3B82F6', color: '#fff' }}>
              + Сотрудник
            </button>
            <button onClick={() => onAddChild(node.id)}
              style={{ ...btnBase, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8' }}>
              + Подотдел
            </button>
            <button onClick={() => onRename(node)}
              style={{ ...btnBase, border: '1px solid #E5E7EB', background: '#fff', color: '#374151' }}>
              Переименовать
            </button>
            <button onClick={() => onDelete(node)}
              style={{ ...btnBase, border: 'none', background: '#FEF2F2', color: '#DC2626' }}>
              Удалить
            </button>
          </div>
        </td>
      </tr>

      {staffOpen && (
        <tr style={{ backgroundColor: '#F8FAFF' }}>
          <td colSpan={4} style={{ padding: '6px 12px 10px' }}>
            <div style={{ paddingInlineStart: depth * 18 + 40 }}>
              {staffLoading ? (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Загрузка...</p>
              ) : staff.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Нет сотрудников</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {staff.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', backgroundColor: '#fff', borderRadius: 7, border: '1px solid #E5E7EB' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#0369A1' }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F2937', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</p>
                        <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                          {s.position_ru}
                          {s.employment_type && s.employment_type !== 'staff' && ` · ${EMP_LABELS[s.employment_type] ?? s.employment_type}`}
                          {s.is_head && ' · Руководитель'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setEditingMember(s)}
                          style={{ padding: '2px 8px', borderRadius: 5, border: '1px solid #BFDBFE', background: '#EFF6FF', fontSize: 11, cursor: 'pointer', color: '#1D4ED8' }}>
                          Редактировать
                        </button>
                        <button onClick={() => deactivateMember(s)}
                          style={{ padding: '2px 8px', borderRadius: 5, border: 'none', background: '#FEF2F2', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
                          Деактивировать
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {expanded && node.children.map(child => (
        <TreeRow key={child.id} node={child} depth={depth + 1} depts={depts}
          onAddChild={onAddChild} onRename={onRename} onDelete={onDelete}
          onAddStaff={onAddStaff} refreshSignal={refreshSignal}
        />
      ))}

      {editingMember && (
        <StaffPositionEditModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null)
            setStaffLoading(true)
            fetch(`/api/settings/departments/${node.id}/staff`)
              .then(r => r.ok ? r.json() : [])
              .then((d: StaffMember[]) => { setStaff(d); setStaffLoading(false) })
          }}
        />
      )}
    </>
  )
}

// ── Employees tab ─────────────────────────────────────────────────────────────

interface Employee {
  position_id: string
  profile_id: string | null
  person_id: string
  full_name: string
  photo_url: string | null
  phone: string | null
  email: string | null
  position: string
  is_head: boolean
  department_id: string
  department_name: string | null
  hire_date: string | null
  employment_type: string | null
  status: 'active' | 'fired' | 'sick_leave' | 'vacation'
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  staff: 'Штат', intern: 'Стажёр', volunteer: 'Волонтёр', contractor: 'Подрядчик',
}
const STATUS_LABELS: Record<string, string> = {
  active: 'Активен', sick_leave: 'На больничном', vacation: 'В отпуске', fired: 'Уволен',
}
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active:     { bg: '#ECFDF5', fg: '#065F46' },
  sick_leave: { bg: '#FEF3C7', fg: '#92400E' },
  vacation:   { bg: '#DBEAFE', fg: '#1E40AF' },
  fired:      { bg: '#FEE2E2', fg: '#991B1B' },
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

type DeptWithKids = Department & { children: DeptWithKids[] }

function flattenDeptOptions(depts: Department[]): { id: string; label: string }[] {
  const map = new Map<string, DeptWithKids>()
  for (const d of depts) map.set(d.id, { ...d, children: [] })
  const roots: DeptWithKids[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node)
    else roots.push(node)
  }
  const out: { id: string; label: string }[] = []
  function walk(node: DeptWithKids, depth: number) {
    out.push({ id: node.id, label: '  '.repeat(depth) + (depth > 0 ? '└ ' : '') + node.name })
    node.children.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => walk(c, depth + 1))
  }
  roots.sort((a, b) => a.name.localeCompare(b.name)).forEach(r => walk(r, 0))
  return out
}

function EmployeesTab({ onAdd, depts, refreshSignal }: { onAdd: () => void; depts: Department[]; refreshSignal: number }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const deptOptions = flattenDeptOptions(depts)

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (deptFilter) params.set('department', deptFilter)
      const res = await fetch(`/api/staff?${params}`)
      if (res.ok) setEmployees(await res.json())
      setLoading(false)
    }, search ? 250 : 0)
    return () => clearTimeout(handle)
  }, [search, deptFilter, refreshSignal])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени, должности..."
          style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none' }} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', color: deptFilter ? '#1F2937' : '#9CA3AF', minWidth: 200 }}>
          <option value="">Все отделы</option>
          {deptOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <button onClick={onAdd}
          style={{ padding: '8px 16px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
          + Добавить сотрудника
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Загрузка...</div>
        ) : employees.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
            {search || deptFilter ? 'Ничего не найдено' : 'Сотрудники не добавлены'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                {['ИМЯ', 'ДОЛЖНОСТЬ', 'ОТДЕЛ', 'ТЕЛЕФОН', 'EMAIL', 'СТАТУС', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const statusKey = emp.status ?? 'active'
                const sc = STATUS_COLORS[statusKey] ?? STATUS_COLORS.active
                return (
                  <tr key={emp.position_id} style={{ borderBottom: '1px solid #F9FAFB' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {emp.photo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={emp.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#3B82F6', flexShrink: 0 }}>{initials(emp.full_name)}</div>
                        }
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{emp.full_name}</span>
                          {emp.is_head && <div style={{ fontSize: 10, color: '#4BAED4', fontWeight: 500 }}>Руководитель</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151' }}>
                      <div>{emp.position}</div>
                      {emp.employment_type && emp.employment_type !== 'staff' && (
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{EMPLOYMENT_LABELS[emp.employment_type] ?? emp.employment_type}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151' }}>{emp.department_name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{emp.phone ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151' }}>{emp.email ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.fg, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {STATUS_LABELS[statusKey] ?? statusKey}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                        <button onClick={() => { if (emp.profile_id) window.location.href = `/dashboard/staff/${emp.profile_id}` }} disabled={!emp.profile_id}
                          style={{ padding: '5px 10px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: emp.profile_id ? 'pointer' : 'not-allowed', color: '#374151', opacity: emp.profile_id ? 1 : 0.5 }}>
                          Открыть
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = ['Структура организации', 'Сотрудники']

export default function StaffPage() {
  const { lang } = useLang()
  const [activeTab, setActiveTab] = useState(0)
  const [depts, setDepts] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshSignal, setRefreshSignal] = useState(0)

  type Modal =
    | { type: 'add'; parentId: string | null }
    | { type: 'rename'; node: TreeNode }
    | null
  const [modal, setModal] = useState<Modal>(null)
  const [addEmployeeDept, setAddEmployeeDept] = useState<string | undefined>(undefined)
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/departments')
    if (!res.ok) { setError('Ошибка загрузки'); setLoading(false); return }
    setDepts(await res.json()); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(node: TreeNode) {
    if (!confirm('Удалить отдел? Дочерние отделы будут перенесены выше.')) return
    await fetch(`/api/settings/departments/${node.id}`, { method: 'DELETE' })
    load()
  }

  const tree = buildTree(depts)
  const title = lang === 'he' ? 'כוח אדם' : lang === 'en' ? 'Staff' : 'Персонал'

  const tabBtn = (idx: number) => ({
    padding: '10px 28px', borderRadius: '8px 8px 0 0', border: '1px solid', borderBottom: 'none',
    marginRight: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.15s',
    ...(activeTab === idx
      ? { backgroundColor: '#E0F2FE', borderColor: '#4BAED4', color: '#1F2937' }
      : { backgroundColor: '#fff', borderColor: '#E5E7EB', color: '#6B7280' }),
  })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: lang === 'he' ? 'ראשי' : lang === 'en' ? 'Home' : 'Главная', href: '/dashboard' },
        { label: title },
      ]} />

      <div style={{ backgroundColor: '#3B82F6', borderLeft: '4px solid #4BAED4', borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</h1>
      </div>

      <div style={{ borderBottom: '1px solid #E5E7EB', display: 'flex' }}>
        {TABS.map((tab, idx) => (
          <button key={tab} onClick={() => setActiveTab(idx)} style={tabBtn(idx)}>{tab}</button>
        ))}
      </div>

      {activeTab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setModal({ type: 'add', parentId: null })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить отдел
            </button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка...</div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
            ) : tree.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Нет подразделений</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB', backgroundColor: '#FAFAFA' }}>
                    {['Название', 'Руководитель', 'Сотрудники', 'Действия'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tree.map(node => (
                    <TreeRow key={node.id} node={node} depth={0} depts={depts}
                      onAddChild={id => setModal({ type: 'add', parentId: id })}
                      onRename={n => setModal({ type: 'rename', node: n })}
                      onDelete={handleDelete}
                      onAddStaff={id => { setAddEmployeeDept(id); setAddEmployeeOpen(true) }}
                      refreshSignal={refreshSignal}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 1 && (
        <EmployeesTab onAdd={() => { setAddEmployeeDept(undefined); setAddEmployeeOpen(true) }} depts={depts} refreshSignal={refreshSignal} />
      )}

      {modal?.type === 'add' && (
        <DeptAddModal depts={depts} parentId={modal.parentId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'rename' && (
        <DeptRenameModal node={modal.node} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {addEmployeeOpen && (
        <AddEmployeeModal
          defaultDepartmentId={addEmployeeDept}
          onClose={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined) }}
          onSaved={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined); load(); setRefreshSignal(s => s + 1) }}
        />
      )}
    </div>
  )
}
