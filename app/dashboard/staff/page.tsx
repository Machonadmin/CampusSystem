'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useMe } from '@/lib/hooks/useMe'
import AddEmployeeModal from './components/AddEmployeeModal'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PageActionButton from '@/components/ui/PageActionButton'
import { toast } from '@/components/ui/toast'

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
  border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }

// ── Dept add modal ────────────────────────────────────────────────────────────

function DeptAddModal({ depts, parentId, onClose, onSaved }: {
  depts: Department[]
  parentId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('staff')
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
    if (!name.trim()) { setErr(t('name_required')); return }
    setSaving(true)
    const res = await fetch('/api/settings/departments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parent_id: selectedParent || null, sort_order: Number(sortOrder) || 0, description: description.trim() || null }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json(); setErr(d.error ?? t('error')) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('new_dept')}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>{t('name_ru_label')}</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
              placeholder={t('dept_name_placeholder')} style={inp} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
            <div>
              <label style={lbl}>{t('parent_dept')}</label>
              <select value={selectedParent} onChange={e => setSelectedParent(e.target.value)} style={inp}>
                <option value="">{t('no_parent_root')}</option>
                {parentOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sort order</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>{t('dept_description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical' }} placeholder={t('short_description_placeholder')} />
          </div>
          {err && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{t('cancel')}</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ padding: '7px 20px', borderRadius: 8, backgroundColor: getModuleColor('staff'), color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dept rename modal ─────────────────────────────────────────────────────────

function DeptRenameModal({ node, onClose, onSaved }: { node: TreeNode; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('staff')
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
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('rename_dept')}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} style={inp} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{t('cancel')}</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: getModuleColor('staff'), color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            {saving ? t('saving') : t('save')}
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
  const t = useTranslations('staff')
  const [position, setPosition] = useState(member.position_ru)
  const [empType, setEmpType] = useState(member.employment_type ?? 'staff')
  const [isHead, setIsHead] = useState(member.is_head)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!position.trim()) { setErr(t('position_required')); return }
    setSaving(true)
    const res = await fetch(`/api/staff/positions/${member.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_ru: position.trim(), employment_type: empType, is_head: isHead }),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else { const d = await res.json(); setErr(d.error ?? t('error')) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('edit_position')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{member.full_name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>{t('position_label')}</label>
            <input autoFocus value={position} onChange={e => setPosition(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>{t('employment_type')}</label>
            <select value={empType} onChange={e => setEmpType(e.target.value)} style={inp}>
              <option value="staff">{t('employment.staff')}</option>
              <option value="part_time">{t('employment.part_time')}</option>
              <option value="intern">{t('employment.intern')}</option>
              <option value="volunteer">{t('employment.volunteer')}</option>
              <option value="contractor">{t('employment.contractor')}</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            {t('head_of_dept')}
          </label>
          {err && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{err}</p>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{t('cancel')}</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: getModuleColor('staff'), color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t('saving') : t('save')}
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
  const tStaff = useTranslations('staff')
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
    if (!confirm(`${tStaff('deactivate_confirm_q1')} "${member.full_name}" (${member.position_ru})?\n\n${tStaff('deactivate_confirm_q2')}`)) return
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
      <tr style={{ borderBottom: '1px solid var(--surface-2)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}>

        <td style={{ padding: '7px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingInlineStart: depth * 18 }}>
            <button onClick={() => setExpanded(v => !v)}
              style={{ width: 16, height: 16, flexShrink: 0, background: 'none', border: 'none', cursor: node.children.length ? 'pointer' : 'default', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginInlineEnd: 5 }}>
              {node.children.length > 0 && (
                <svg style={{ width: 10, height: 10, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: 'var(--text)' }}>{node.name}</span>
          </div>
        </td>

        <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          {node.head_name ?? <span style={{ color: 'var(--border-strong)' }}>—</span>}
        </td>

        <td style={{ padding: '7px 12px' }}>
          <button onClick={() => setStaffOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10, backgroundColor: staffOpen ? '#DBEAFE' : 'var(--surface-2)', color: staffOpen ? '#1D4ED8' : 'var(--text-muted)', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            {node.employee_count} {tStaff('employees_short')}
            <svg style={{ width: 9, height: 9, transform: staffOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </td>

        <td style={{ padding: '7px 12px' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => onAddStaff(node.id)}
              style={{ ...btnBase, border: 'none', background: getModuleColor('staff'), color: '#fff' }}>
              + {tStaff('employee')}
            </button>
            <button onClick={() => onAddChild(node.id)}
              style={{ ...btnBase, border: `1px solid ${getModuleColor('staff', 'medium')}`, background: getModuleColor('staff', 'light'), color: getModuleColor('staff') }}>
              + {tStaff('subdept')}
            </button>
            <button onClick={() => onRename(node)}
              style={{ ...btnBase, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
              {tStaff('rename')}
            </button>
            <button onClick={() => onDelete(node)}
              style={{ ...btnBase, border: 'none', background: '#FEF2F2', color: '#DC2626' }}>
              {tStaff('delete')}
            </button>
          </div>
        </td>
      </tr>

      {staffOpen && (
        <tr style={{ backgroundColor: '#F8FAFF' }}>
          <td colSpan={4} style={{ padding: '6px 12px 10px' }}>
            <div style={{ paddingInlineStart: depth * 18 + 40 }}>
              {staffLoading ? (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{tStaff('loading')}</p>
              ) : staff.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{tStaff('no_staff_in_dept')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {staff.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', backgroundColor: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#0369A1' }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                          {s.position_ru}
                          {s.employment_type && s.employment_type !== 'staff' && ` · ${tStaff(`employment.${s.employment_type}`, s.employment_type)}`}
                          {s.is_head && ` · ${tStaff('dept.head_label')}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setEditingMember(s)}
                          style={{ padding: '2px 8px', borderRadius: 5, border: '1px solid #BFDBFE', background: 'var(--accent-tint)', fontSize: 11, cursor: 'pointer', color: '#1D4ED8' }}>
                          {tStaff('edit')}
                        </button>
                        <button onClick={() => deactivateMember(s)}
                          style={{ padding: '2px 8px', borderRadius: 5, border: 'none', background: '#FEF2F2', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
                          {tStaff('deactivate')}
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
  gender: string | null
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

function EmployeesTab({ onAdd, depts, refreshSignal }: { onAdd: (employee?: Employee) => void; depts: Department[]; refreshSignal: number }) {
  const t = useTranslations('staff')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const me = useMe()
  const isSuperadmin = !!me?.roles.includes('superadmin')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [localRefresh, setLocalRefresh] = useState(0)
  const deptOptions = flattenDeptOptions(depts)

  function genderLabel(g: string | null): string | null {
    if (g === 'male') return t('gender.male')
    if (g === 'female') return t('gender.female')
    return null
  }

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
  }, [search, deptFilter, refreshSignal, localRefresh])

  async function handleDeleteEmployee(profileId: string, fullName: string) {
    if (!confirm(`${t('delete_employee_confirm_q1')} ${fullName}?\n\n${t('delete_employee_confirm_q2')}`)) return
    try {
      const res = await fetch(`/api/staff/${profileId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast(data.error || t('delete_error'), 'error')
        return
      }
      setLocalRefresh(n => n + 1)
    } catch {
      toast(t('delete_employee_error'), 'error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_by')}
          style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', color: deptFilter ? 'var(--text)' : 'var(--text-faint)', minWidth: 200 }}>
          <option value="">{t('all_depts')}</option>
          {deptOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <PageActionButton
          label={t('add_employee')}
          onClick={() => onAdd()}
          accentColor={getModuleColor('staff')}
        />
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
        ) : employees.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
            {search || deptFilter ? t('no_results') : t('no_employees')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                {[t('table.full_name'), t('table.position'), t('table.department'), t('table.phone'), t('table.email'), t('table.status'), ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textAlign: 'start', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const statusKey = emp.status ?? 'active'
                const sc = STATUS_COLORS[statusKey] ?? STATUS_COLORS.active
                return (
                  <tr key={emp.position_id} style={{ borderBottom: '1px solid var(--surface-2)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {emp.photo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={emp.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: getModuleColor('staff', 'light'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: getModuleColor('staff'), flexShrink: 0 }}>{initials(emp.full_name)}</div>
                        }
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{emp.full_name}</span>
                            {genderLabel(emp.gender) && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {genderLabel(emp.gender)}
                              </span>
                            )}
                          </div>
                          {emp.is_head && <div style={{ fontSize: 10, color: '#4BAED4', fontWeight: 500 }}>{t('dept.head_label')}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>
                      <div>{emp.position}</div>
                      {emp.employment_type && emp.employment_type !== 'staff' && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t(`employment.${emp.employment_type}`, emp.employment_type)}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{emp.department_name ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{emp.phone ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{emp.email ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.fg, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {t(`status.${statusKey}`, statusKey)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                        {isSuperadmin && (
                          <button
                            onClick={() => router.push(`/dashboard/settings/users?person=${emp.person_id}`)}
                            style={{ padding: '5px 12px', fontSize: 12, border: '1px solid var(--border-strong)', borderRadius: 6, background: getModuleColor('staff', 'light'), cursor: 'pointer', color: getModuleColor('staff') }}
                          >
                            {t('create_login')}
                          </button>
                        )}
                        <button
                          onClick={() => emp.profile_id && onAdd(emp)}
                          disabled={!emp.profile_id}
                          style={{ padding: '5px 12px', fontSize: 12, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--surface)', cursor: emp.profile_id ? 'pointer' : 'not-allowed', color: 'var(--text)', opacity: emp.profile_id ? 1 : 0.5 }}
                        >
                          {tCommon('edit')}
                        </button>
                        <button
                          onClick={() => emp.profile_id && handleDeleteEmployee(emp.profile_id, emp.full_name)}
                          disabled={!emp.profile_id}
                          style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #FEE2E2', borderRadius: 6, background: '#FEF2F2', cursor: emp.profile_id ? 'pointer' : 'not-allowed', color: '#DC2626', opacity: emp.profile_id ? 1 : 0.5 }}
                        >
                          {tCommon('delete')}
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

export default function StaffPage() {
  const t = useTranslations('staff')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const [activeTab, setActiveTab] = useState<string>('structure')
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
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/departments')
    if (!res.ok) { setError(t('load_error')); setLoading(false); return }
    setDepts(await res.json()); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(node: TreeNode) {
    if (!confirm(t('delete_dept_confirm'))) return
    await fetch(`/api/settings/departments/${node.id}`, { method: 'DELETE' })
    load()
  }

  const tree = buildTree(depts)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('staff'),
        borderRadius: 12, padding: '12px 24px',
        boxShadow: '0 2px 8px rgba(139,92,246,0.2)',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
      </div>

      <ModuleTabs
        tabs={[
          { key: 'structure', label: t('tabs.structure') },
          { key: 'staff', label: t('tabs.staff') },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        accentColor={getModuleColor('staff')}
      />

      {activeTab === 'structure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PageActionButton
              label={t('add_dept')}
              onClick={() => setModal({ type: 'add', parentId: null })}
              accentColor={getModuleColor('staff')}
            />
          </div>

          <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
            ) : tree.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('no_depts')}</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
                    {[t('dept.name_col'), t('dept.head_col'), t('dept.staff_col'), t('dept.actions_col')].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tree.map(node => (
                    <TreeRow key={node.id} node={node} depth={0} depts={depts}
                      onAddChild={id => setModal({ type: 'add', parentId: id })}
                      onRename={n => setModal({ type: 'rename', node: n })}
                      onDelete={handleDelete}
                      onAddStaff={id => { setEditingEmployee(null); setAddEmployeeDept(id); setAddEmployeeOpen(true) }}
                      refreshSignal={refreshSignal}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'staff' && (
        <EmployeesTab
          onAdd={(employee) => { setEditingEmployee(employee ?? null); setAddEmployeeDept(undefined); setAddEmployeeOpen(true) }}
          depts={depts}
          refreshSignal={refreshSignal}
        />
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
          editing={editingEmployee}
          onClose={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined); setEditingEmployee(null) }}
          onSaved={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined); setEditingEmployee(null); load(); setRefreshSignal(s => s + 1) }}
        />
      )}
    </div>
  )
}
