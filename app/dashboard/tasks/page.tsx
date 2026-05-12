'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import ModuleTabs from '@/components/ui/ModuleTabs'
import TasksList from './components/TasksList'
import TaskCreateModal from './components/TaskCreateModal'
import TaskDetailModal from './components/TaskDetailModal'
import type { TaskRow } from '@/types/database'

type ViewMode = 'assigned' | 'created' | 'department' | 'watching'
type StatusFilter = 'all' | 'active' | TaskRow['status']
type PriorityFilter = 'all' | TaskRow['priority']

const TERMINAL_STATUSES = ['completed', 'cancelled', 'declined'] as const

function emptyMessage(view: ViewMode): string {
  switch (view) {
    case 'assigned':   return 'Вам пока не назначено задач'
    case 'created':    return 'Вы пока не создавали задач'
    case 'department': return 'В пуле вашего отдела нет задач'
    case 'watching':   return 'Вы пока не наблюдаете за задачами'
  }
}

const inp: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 6,
  background: '#fff', color: '#1F2937', outline: 'none',
}

export default function TasksPage() {
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
        throw new Error(e.error ?? `Ошибка ${resp.status}`)
      }
      const json = await resp.json()
      let list: TaskRow[] = json.tasks ?? []

      if (statusFilter === 'active') {
        list = list.filter(t => !(TERMINAL_STATUSES as readonly string[]).includes(t.status))
      }

      setTasks(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
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

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Задачи' },
      ]} />

      {/* Хедер */}
      <div style={{
        background: getModuleHeaderGradient('tasks'),
        borderRadius: 12,
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
        color: '#fff',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Задачи</h1>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 500,
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          + Новая задача
        </button>
      </div>

      {/* Вкладки */}
      <ModuleTabs
        tabs={[
          { key: 'assigned',   label: 'Назначенные' },
          { key: 'created',    label: 'Мои' },
          { key: 'department', label: 'Отдел' },
          { key: 'watching',   label: 'Наблюдаю' },
        ]}
        active={view}
        onChange={k => {
          setView(k as ViewMode)
          setStatusFilter('active')
          setPriorityFilter('all')
        }}
        accentColor={accent}
      />

      {/* Фильтры */}
      <div style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
        padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Статус:</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={inp}>
          <option value="active">Активные</option>
          <option value="all">Все</option>
          <option value="unassigned">В пуле</option>
          <option value="pending">К выполнению</option>
          <option value="in_progress">В работе</option>
          <option value="review">На проверке</option>
          <option value="completed">Завершённые</option>
          <option value="cancelled">Отменённые</option>
          <option value="declined">Отклонённые</option>
        </select>

        <label style={{ fontSize: 13, color: '#374151', fontWeight: 500, marginLeft: 4 }}>Приоритет:</label>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as PriorityFilter)} style={inp}>
          <option value="all">Любой</option>
          <option value="urgent">Срочно</option>
          <option value="high">Высокий</option>
          <option value="normal">Обычный</option>
          <option value="low">Низкий</option>
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 12, color: '#6B7280' }}>
          Всего: {tasks.length}
        </div>
      </div>

      {/* Контент */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          Загрузка…
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div style={{
          padding: 48, textAlign: 'center', color: '#6B7280', fontSize: 14,
          background: '#fff', border: '1px dashed #D1D5DB', borderRadius: 10,
        }}>
          {emptyMessage(view)}
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
