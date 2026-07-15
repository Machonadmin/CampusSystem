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

        <PageActionButton
          label={t('new_task')}
          onClick={() => setCreateOpen(true)}
          accentColor={accent}
        />
      </div>

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
        />
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
