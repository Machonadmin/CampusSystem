'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useLang } from '@/lib/i18n/LanguageContext'

interface Department {
  id: string
  name: string
  parent_id: string | null
  head_name: string | null
  employee_count: number
}

interface TreeNode extends Department { children: TreeNode[] }

interface StaffMember {
  id: string
  full_name: string
  position_ru: string
  is_head: boolean
  employment_type: string | null
}

interface PersonResult { id: string; full_name: string; email: string | null }

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
  const sort = (nodes: TreeNode[]) => { nodes.sort((a, b) => a.name.localeCompare(b.name)); nodes.forEach(n => sort(n.children)) }
  sort(roots)
  return roots
}

// ── Add-staff modal ──────────────────────────────────────────────────────────

function AddStaffModal({ deptId, onClose, onSaved }: { deptId: string; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PersonResult | null>(null)
  const [createNew, setCreateNew] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [empType, setEmpType] = useState('staff')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function search(q: string) {
    setQuery(q); setSelected(null); setCreateNew(false)
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json())
      setSearching(false)
    }, 300)
  }

  async function save() {
    setErr('')
    if (!position.trim()) { setErr('Должность обязательна'); return }
    if (!selected && !createNew) { setErr('Выберите человека или создайте нового'); return }
    if (createNew && !fullName.trim()) { setErr('Введите имя'); return }
    setSaving(true)
    const body = selected
      ? { person_id: selected.id, position_ru: position.trim(), employment_type: empType }
      : { full_name: fullName.trim(), email: email.trim() || undefined, position_ru: position.trim(), employment_type: empType }
    const res = await fetch(`/api/settings/departments/${deptId}/staff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка') }
  }

  const personChosen = !!selected || createNew

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>Добавить сотрудника</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Поиск в базе людей</p>

          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #4BAED4', backgroundColor: '#F0F9FF', marginBottom: 8 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0 }}>{selected.full_name}</p>
                {selected.email && <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{selected.email}</p>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          )}

          {createNew && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>Новый человек</p>
              <button onClick={() => setCreateNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          )}

          {!personChosen && (
            <div style={{ position: 'relative' }}>
              <input
                value={query} onChange={e => search(e.target.value)}
                placeholder="Введите имя или email..."
                autoComplete="off"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              {(searching || results.length > 0 || query.length >= 2) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden' }}>
                  {searching && <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>Поиск...</div>}
                  {!searching && results.map(p => (
                    <div key={p.id} onClick={() => { setSelected(p); setResults([]); setQuery('') }}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F9FAFB' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0 }}>{p.full_name}</p>
                      {p.email && <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{p.email}</p>}
                    </div>
                  ))}
                  {!searching && (
                    <div onClick={() => { setCreateNew(true); setResults([]); setQuery('') }}
                      style={{ padding: '10px 12px', cursor: 'pointer', color: '#2D3170', fontSize: 13, fontWeight: 500, borderTop: results.length > 0 ? '1px solid #E5E7EB' : 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F0F4FF' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}>
                      + Создать нового человека
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {createNew && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Полное имя *</span>
                <input autoFocus value={fullName} onChange={e => setFullName(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Email</span>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }} />
              </label>
            </>
          )}

          {personChosen && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Должность *</span>
                <input value={position} onChange={e => setPosition(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Тип занятости</span>
                <select value={empType} onChange={e => setEmpType(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', backgroundColor: '#fff' }}>
                  <option value="staff">Штат</option>
                  <option value="intern">Стажёр</option>
                  <option value="volunteer">Волонтёр</option>
                  <option value="contractor">Подрядчик</option>
                </select>
              </label>
            </>
          )}

          {err && <p style={{ fontSize: 12, color: '#DC2626', margin: 0 }}>{err}</p>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Отмена</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dept name/rename modal ───────────────────────────────────────────────────

function DeptModal({ title, initialName = '', onClose, onSave }: { title: string; initialName?: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!name.trim()) return
    setSaving(true); await onSave(name.trim()); setSaving(false)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{title}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Отмена</button>
          <button onClick={submit} disabled={saving || !name.trim()}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !name.trim()) ? 'not-allowed' : 'pointer', opacity: (saving || !name.trim()) ? 0.6 : 1 }}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tree row ─────────────────────────────────────────────────────────────────

function TreeRow({ node, depth, onAddChild, onRename, onDelete, onAddStaff, refreshSignal }: {
  node: TreeNode; depth: number
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

  useEffect(() => {
    if (!staffOpen) return
    setStaffLoading(true)
    fetch(`/api/settings/departments/${node.id}/staff`)
      .then(r => r.ok ? r.json() : [])
      .then((d: StaffMember[]) => { setStaff(d); setStaffLoading(false) })
  }, [staffOpen, node.id, refreshSignal])

  return (
    <>
      <tr style={{ borderBottom: '1px solid #F3F4F6' }}
        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F9FAFB' }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}>

        <td style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingInlineStart: depth * 20 }}>
            <button onClick={() => setExpanded(v => !v)}
              style={{ width: 18, height: 18, flexShrink: 0, background: 'none', border: 'none', cursor: node.children.length ? 'pointer' : 'default', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginInlineEnd: 6 }}>
              {node.children.length > 0 && (
                <svg style={{ width: 12, height: 12, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: '#1F2937' }}>{node.name}</span>
          </div>
        </td>

        <td style={{ padding: '9px 14px', fontSize: 12, color: '#6B7280' }}>
          {node.head_name ?? <span style={{ color: '#D1D5DB' }}>—</span>}
        </td>

        <td style={{ padding: '9px 14px' }}>
          <button onClick={() => setStaffOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, backgroundColor: staffOpen ? '#DBEAFE' : '#F3F4F6', color: staffOpen ? '#1D4ED8' : '#6B7280', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            {node.employee_count} сотр.
            <svg style={{ width: 10, height: 10, transform: staffOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </td>

        <td style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onAddStaff(node.id)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', fontSize: 11, cursor: 'pointer', color: '#1D4ED8', whiteSpace: 'nowrap' }}>
              + Сотрудник
            </button>
            <button onClick={() => onAddChild(node.id)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}>
              + Подотдел
            </button>
            <button onClick={() => onRename(node)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151' }}>
              Переименовать
            </button>
            <button onClick={() => onDelete(node)}
              style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#FEF2F2', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
              Удалить
            </button>
          </div>
        </td>
      </tr>

      {staffOpen && (
        <tr style={{ backgroundColor: '#FAFBFF' }}>
          <td colSpan={4} style={{ padding: '8px 14px 12px' }}>
            <div style={{ paddingInlineStart: depth * 20 + 44 }}>
              {staffLoading ? (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Загрузка...</p>
              ) : staff.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Нет сотрудников</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {staff.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
                        {s.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0 }}>{s.full_name}</p>
                        <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                          {s.position_ru}
                          {s.employment_type && s.employment_type !== 'staff' && ` · ${EMP_LABELS[s.employment_type] ?? s.employment_type}`}
                          {s.is_head && ' · Руководитель'}
                        </p>
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
        <TreeRow key={child.id} node={child} depth={depth + 1} onAddChild={onAddChild} onRename={onRename} onDelete={onDelete} onAddStaff={onAddStaff} refreshSignal={refreshSignal} />
      ))}
    </>
  )
}

// ── Employees tab (placeholder) ───────────────────────────────────────────────

function EmployeesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Поиск по имени или должности..."
          disabled
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, color: '#9CA3AF', backgroundColor: '#F9FAFB', outline: 'none' }}
        />
        <select disabled style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, color: '#9CA3AF', backgroundColor: '#F9FAFB', outline: 'none' }}>
          <option>Все отделы</option>
        </select>
        <button disabled style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#D1D5DB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'not-allowed' }}>
          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Добавить сотрудника
        </button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {['Сотрудник', 'Должность', 'Отдел', 'Тип', 'Действия'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} style={{ padding: 48, textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <svg style={{ width: 40, height: 40, color: '#D1D5DB' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                  </svg>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#6B7280', margin: 0 }}>Раздел в разработке</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Список сотрудников появится здесь</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TABS = ['Структура организации', 'Сотрудники']

export default function StaffPage() {
  const { lang } = useLang()

  const [activeTab, setActiveTab] = useState(0)
  const [depts, setDepts] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshSignal, setRefreshSignal] = useState(0)

  type Modal = { type: 'add'; parentId: string | null } | { type: 'rename'; node: TreeNode } | null
  const [modal, setModal] = useState<Modal>(null)
  const [addStaffDept, setAddStaffDept] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/departments')
    if (!res.ok) { setError('Ошибка загрузки'); setLoading(false); return }
    setDepts(await res.json()); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAdd(name: string, parentId: string | null) {
    await fetch('/api/settings/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent_id: parentId }) })
    setModal(null); load()
  }

  async function handleRename(name: string, id: string) {
    await fetch(`/api/settings/departments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    setModal(null); load()
  }

  async function handleDelete(node: TreeNode) {
    if (!confirm('Удалить отдел? Дочерние отделы будут перенесены выше.')) return
    await fetch(`/api/settings/departments/${node.id}`, { method: 'DELETE' })
    load()
  }

  const tree = buildTree(depts)
  const title = lang === 'he' ? 'כוח אדם' : lang === 'en' ? 'Staff' : 'Персонал'

  const tabBtn = (idx: number) => ({
    padding: '10px 28px',
    borderRadius: '8px 8px 0 0',
    border: '1px solid',
    borderBottom: 'none',
    marginRight: 4,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
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

      <div style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{title}</h1>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid #E5E7EB', display: 'flex' }}>
        {TABS.map((tab, idx) => (
          <button key={tab} onClick={() => setActiveTab(idx)} style={tabBtn(idx)}>{tab}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setModal({ type: 'add', parentId: null })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#2D3170', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
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
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {['Название', 'Руководитель', 'Сотрудники', 'Действия'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tree.map(node => (
                    <TreeRow key={node.id} node={node} depth={0}
                      onAddChild={id => setModal({ type: 'add', parentId: id })}
                      onRename={n => setModal({ type: 'rename', node: n })}
                      onDelete={handleDelete}
                      onAddStaff={id => setAddStaffDept(id)}
                      refreshSignal={refreshSignal}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 1 && <EmployeesTab />}

      {modal?.type === 'add' && (
        <DeptModal title="Новый отдел" onClose={() => setModal(null)} onSave={name => handleAdd(name, modal.parentId)} />
      )}
      {modal?.type === 'rename' && (
        <DeptModal title="Переименовать" initialName={modal.node.name} onClose={() => setModal(null)} onSave={name => handleRename(name, modal.node.id)} />
      )}
      {addStaffDept && (
        <AddStaffModal
          deptId={addStaffDept}
          onClose={() => setAddStaffDept(null)}
          onSaved={() => { setAddStaffDept(null); load(); setRefreshSignal(s => s + 1) }}
        />
      )}
    </div>
  )
}
