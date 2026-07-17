'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import ModuleTabs from '@/components/ui/ModuleTabs'
import TasksList from './components/TasksList'
import TaskCreateModal from './components/TaskCreateModal'
import TaskDetailModal from './components/TaskDetailModal'
import PageActionButton from '@/components/ui/PageActionButton'
import { PersonSelect } from '@/components/ui/person-select'
import type { TaskRow } from '@/types/database'

type ViewMode = 'assigned' | 'created' | 'department' | 'watching'
type StatusFilter = 'all' | 'active' | TaskRow['status']
type PriorityFilter = 'all' | TaskRow['priority']

const TERMINAL_STATUSES = ['completed', 'cancelled', 'declined'] as const

const inp: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--border-strong)', borderRadius: 6,
  background: 'var(--surface)', color: 'var(--text)', outline: 'none',
}

export default function TasksPage() {
  const t = useTranslations('tasks')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [view, setView] = useState<ViewMode>('assigned')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')

  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen,    setCreateOpen]    = useState(false)
  const [openTaskId,    setOpenTaskId]    = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // ── Массовые действия (bulk) ──
  const [selectMode,  setSelectMode]  = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy,    setBulkBusy]    = useState(false)
  const [bulkMsg,     setBulkMsg]     = useState<string | null>(null)
  const [assignOpen,  setAssignOpen]  = useState(false)
  const [assignPerson, setAssignPerson] = useState<string | null>(null)

  const accent = getModuleColor('tasks')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('view', view)
      if (statusFilter !== 'all' && statusFilter !== 'active') {
        params.set('status', statusFilter)
      }
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)

      const resp = await fetch(`/api/tasks?${params.toString()}`)
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}))
        throw new Error(e.error ?? `${tCommon('error')} ${resp.status}`)
      }
      const json = await resp.json()
      let list: TaskRow[] = json.tasks ?? []

      if (statusFilter === 'active') {
        list = list.filter(task => !(TERMINAL_STATUSES as readonly string[]).includes(task.status))
      }

      setTasks(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
  }, [view, statusFilter, priorityFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.person_id) setCurrentUserId(d.person_id) })
      .catch(() => {})
  }, [])

  function emptyMsg(): string {
    const map: Record<ViewMode, string> = {
      assigned:   t('empty.assigned'),
      created:    t('empty.created'),
      department: t('empty.department'),
      watching:   t('empty.watching'),
    }
    return map[view]
  }

  // ── Массовые действия ──
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function exitSelectMode() {
    setSelectMode(false); setSelectedIds(new Set())
  }

  async function patchStatus(id: string, status: string): Promise<boolean> {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    return res.ok
  }

  // Завершить выбранные. completed достижим только из in_progress/review;
  // pending проводим в два шага (in_progress → completed). Остальные — пропуск.
  async function bulkComplete() {
    setBulkBusy(true); setBulkMsg(null)
    let done = 0, skipped = 0
    for (const id of selectedIds) {
      const task = tasks.find(t => t.id === id)
      if (!task) { skipped++; continue }
      let ok = false
      if (task.status === 'in_progress' || task.status === 'review') {
        ok = await patchStatus(id, 'completed')
      } else if (task.status === 'pending') {
        ok = (await patchStatus(id, 'in_progress')) && (await patchStatus(id, 'completed'))
      } else { skipped++; continue }
      if (ok) done++; else skipped++
    }
    setBulkBusy(false)
    setBulkMsg(t('bulk.done_result').replace('{done}', String(done)).replace('{skipped}', String(skipped)))
    exitSelectMode()
    await load()
  }

  async function bulkAssign() {
    if (!assignPerson) return
    setBulkBusy(true); setBulkMsg(null)
    let ok = 0, fail = 0
    for (const id of selectedIds) {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee_id: assignPerson, assignee_type: 'person' }),
      })
      if (res.ok) ok++; else fail++
    }
    setBulkBusy(false)
    setAssignOpen(false); setAssignPerson(null)
    setBulkMsg(t('bulk.assign_result').replace('{ok}', String(ok)).replace('{fail}', String(fail)))
    exitSelectMode()
    await load()
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('tasks'),
        borderRadius: 12,
        padding: '12px 24px',
        boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
        color: '#fff',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
      </div>

      {/* Tabs */}
      <ModuleTabs
        tabs={[
          { key: 'assigned',   label: t('filters.assigned') },
          { key: 'created',    label: t('filters.my') },
          { key: 'department', label: t('filters.department') },
          { key: 'watching',   label: t('filters.watching') },
        ]}
        active={view}
        onChange={k => {
          setView(k as ViewMode)
          setStatusFilter('active')
          setPriorityFilter('all')
        }}
        accentColor={accent}
      />

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{t('filter_labels.status')}</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={inp}>
          <option value="active">{t('filters.active')}</option>
          <option value="all">{t('filters.all')}</option>
          <option value="unassigned">{t('status.unassigned')}</option>
          <option value="pending">{t('status.pending')}</option>
          <option value="in_progress">{t('status.in_progress')}</option>
          <option value="review">{t('status.review')}</option>
          <option value="completed">{t('status.completed')}</option>
          <option value="cancelled">{t('status.cancelled')}</option>
          <option value="declined">{t('status.declined')}</option>
        </select>

        <label style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginLeft: 4 }}>{t('filter_labels.priority')}</label>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as PriorityFilter)} style={inp}>
          <option value="all">{t('filters.all')}</option>
          <option value="urgent">{t('priority.urgent')}</option>
          <option value="high">{t('priority.high')}</option>
          <option value="normal">{t('priority.normal')}</option>
          <option value="low">{t('priority.low')}</option>
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('filter_labels.total')} {tasks.length}
        </div>

        <button
          onClick={() => { if (selectMode) exitSelectMode(); else { setSelectMode(true); setBulkMsg(null) } }}
          style={{
            ...inp, cursor: 'pointer', fontWeight: 600,
            background: selectMode ? '#FEF3C7' : 'var(--surface)',
            color: selectMode ? '#92400E' : 'var(--text)',
            borderColor: selectMode ? '#F59E0B' : 'var(--border-strong)',
          }}
        >
          {selectMode ? t('bulk.exit') : t('bulk.select')}
        </button>

        <PageActionButton
          label={t('new_task')}
          onClick={() => setCreateOpen(true)}
          accentColor={accent}
        />
      </div>

      {/* Панель массовых действий */}
      {selectMode && (
        <div style={{
          background: 'var(--surface)', border: '1px solid #F59E0B', borderRadius: 10,
          padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {t('bulk.selected').replace('{n}', String(selectedIds.size))}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={bulkComplete}
            disabled={bulkBusy || selectedIds.size === 0}
            style={{ ...inp, cursor: bulkBusy || selectedIds.size === 0 ? 'default' : 'pointer', fontWeight: 600, background: '#D1FAE5', color: '#065F46', borderColor: '#065F46', opacity: bulkBusy || selectedIds.size === 0 ? 0.5 : 1 }}
          >
            {t('bulk.mark_done')}
          </button>
          <button
            onClick={() => { if (selectedIds.size > 0) setAssignOpen(true) }}
            disabled={bulkBusy || selectedIds.size === 0}
            style={{ ...inp, cursor: bulkBusy || selectedIds.size === 0 ? 'default' : 'pointer', fontWeight: 600, opacity: bulkBusy || selectedIds.size === 0 ? 0.5 : 1 }}
          >
            {t('bulk.assign')}
          </button>
        </div>
      )}

      {bulkMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>
          {bulkMsg}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {tCommon('loading')}
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div style={{
          padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14,
          background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10,
        }}>
          {emptyMsg()}
        </div>
      )}

      {!loading && !error && tasks.length > 0 && (
        <TasksList
          tasks={tasks}
          onTaskClick={id => setOpenTaskId(id)}
          selectedIds={selectMode ? selectedIds : undefined}
          onToggleSelect={selectMode ? toggleSelect : undefined}
        />
      )}

      {/* Модалка массового назначения */}
      {assignOpen && (
        <div
          onClick={() => { if (!bulkBusy) { setAssignOpen(false); setAssignPerson(null) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 420, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t('bulk.assign_title')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{t('bulk.selected').replace('{n}', String(selectedIds.size))}</p>
            <PersonSelect value={assignPerson} onChange={id => setAssignPerson(id)} label={t('bulk.assign_to')} accentColor={accent} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => { setAssignOpen(false); setAssignPerson(null) }} disabled={bulkBusy} style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>{tCommon('cancel')}</button>
              <button onClick={bulkAssign} disabled={bulkBusy || !assignPerson} style={{ ...inp, cursor: bulkBusy || !assignPerson ? 'default' : 'pointer', fontWeight: 600, background: accent, color: '#fff', borderColor: accent, opacity: bulkBusy || !assignPerson ? 0.6 : 1 }}>{tCommon('save')}</button>
            </div>
          </div>
        </div>
      )}

      {createOpen && currentUserId && (
        <TaskCreateModal
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load() }}
        />
      )}

      {openTaskId && currentUserId && (
        <TaskDetailModal
          taskId={openTaskId}
          currentUserId={currentUserId}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => { setOpenTaskId(null); load() }}
        />
      )}
    </div>
  )
}
