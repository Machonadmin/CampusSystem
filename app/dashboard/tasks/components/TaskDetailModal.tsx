'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TaskRow, TaskCommentType, TaskStatus } from '@/types/database'
import { getModuleColor } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'

interface Comment {
  id: string
  task_id: string
  author_id: string
  author?: { id: string; full_name: string } | null
  content: string
  comment_type: TaskCommentType
  created_at: string
}

interface Watcher {
  task_id: string
  person_id: string
  added_at: string
  person?: { id: string; full_name: string } | null
}

interface HistoryEntry {
  id: string
  task_id: string
  actor_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  note: string | null
  created_at: string
  actor?: { id: string; full_name: string } | null
}

interface TaskDetail extends TaskRow {
  assignee?: { id: string; full_name: string } | null
  department?: { id: string; name: string } | null
  creator?: { id: string; full_name: string } | null
}

interface Props {
  taskId: string
  currentUserId: string
  onClose: () => void
  onChanged: () => void
}

const STATUS_LABELS: Record<TaskRow['status'], string> = {
  unassigned:  'В пуле',
  pending:     'К выполнению',
  in_progress: 'В работе',
  review:      'На проверке',
  completed:   'Завершена',
  cancelled:   'Отменена',
  declined:    'Отклонена',
}

const STATUS_COLORS: Record<TaskRow['status'], { bg: string; fg: string }> = {
  unassigned:  { bg: '#F3F4F6', fg: '#374151' },
  pending:     { bg: '#DBEAFE', fg: '#1E40AF' },
  in_progress: { bg: '#FEF3C7', fg: '#92400E' },
  review:      { bg: '#FCE7F3', fg: '#9D174D' },
  completed:   { bg: '#D1FAE5', fg: '#065F46' },
  cancelled:   { bg: '#F3F4F6', fg: '#6B7280' },
  declined:    { bg: '#FEE2E2', fg: '#991B1B' },
}

const PRIORITY_LABELS: Record<TaskRow['priority'], string> = {
  low: 'Низкий', normal: 'Средний', high: 'Высокий', urgent: 'Срочный',
}

const PRIORITY_COLORS: Record<TaskRow['priority'], string> = {
  low: '#9CA3AF', normal: '#6B7280', high: '#F59E0B', urgent: '#DC2626',
}

type ActionKey = 'claim' | 'start' | 'review' | 'complete' | 'reopen' | 'decline' | 'cancel' | 'cancelSeries'

interface ActionDef {
  label: string
  action: ActionKey
  danger?: boolean
  needsReason?: boolean
}

export default function TaskDetailModal({ taskId, currentUserId, onClose, onChanged }: Props) {
  const accent = getModuleColor('tasks')

  const [task,     setTask]     = useState<TaskDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [history,  setHistory]  = useState<HistoryEntry[]>([])

  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState<string | null>(null)
  const [actionInProgress,  setActionInProgress]  = useState(false)
  const [showDeclineInput,  setShowDeclineInput]  = useState(false)
  const [declineReason,     setDeclineReason]     = useState('')

  const [newCommentText,    setNewCommentText]    = useState('')
  const [postingComment,    setPostingComment]    = useState(false)

  const [addingWatcher,     setAddingWatcher]     = useState(false)
  const [newWatcherId,      setNewWatcherId]      = useState<string | null>(null)

  const [showCancelSeriesDialog, setShowCancelSeriesDialog] = useState(false)
  const [cancelSeriesMode,       setCancelSeriesMode]       = useState<'future' | 'all'>('future')
  const [seriesPreview,          setSeriesPreview]          = useState<{
    total: number
    by_status: Record<string, number>
  } | null>(null)
  const [loadingPreview,         setLoadingPreview]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? `Не удалось загрузить задачу (${resp.status})`)
      }
      const data = await resp.json()
      setTask(data.task as TaskDetail)
      setComments((data.comments ?? []) as Comment[])
      setWatchers((data.watchers ?? []) as Watcher[])
      setHistory((data.history ?? []) as HistoryEntry[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { load() }, [load])

  const loadSeriesPreview = useCallback(async (mode: 'future' | 'all') => {
    if (!task?.recurrence_series_id) return
    setLoadingPreview(true)
    try {
      let url = `/api/tasks/series/${task.recurrence_series_id}`
      if (mode === 'future' && task.due_date) url += `?from_date=${task.due_date}`
      const resp = await fetch(url)
      if (!resp.ok) { setSeriesPreview(null); return }
      const data = await resp.json()
      setSeriesPreview({ total: data.total ?? 0, by_status: data.by_status ?? {} })
    } catch {
      setSeriesPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }, [task?.recurrence_series_id, task?.due_date])

  useEffect(() => {
    if (showCancelSeriesDialog) loadSeriesPreview(cancelSeriesMode)
  }, [cancelSeriesMode, showCancelSeriesDialog, loadSeriesPreview])

  const getAvailableActions = (): ActionDef[] => {
    if (!task) return []
    const isCreator  = task.creator_id  === currentUserId
    const isAssignee = task.assignee_id === currentUserId
    const out: ActionDef[] = []

    switch (task.status) {
      case 'unassigned':
        out.push({ label: 'Взять в работу', action: 'claim' })
        if (isCreator) out.push({ label: 'Отменить', action: 'cancel', danger: true })
        break
      case 'pending':
        if (isAssignee) {
          out.push({ label: 'Начать работу', action: 'start' })
          out.push({ label: 'Отклонить', action: 'decline', danger: true, needsReason: true })
        }
        if (isCreator) out.push({ label: 'Отменить', action: 'cancel', danger: true })
        break
      case 'in_progress':
        if (isAssignee) out.push({ label: 'На проверку', action: 'review' })
        if (isCreator) out.push({ label: 'Отменить', action: 'cancel', danger: true })
        break
      case 'review':
        if (isCreator) {
          out.push({ label: 'Завершить', action: 'complete' })
          out.push({ label: 'Вернуть в работу', action: 'reopen' })
        }
        break
    }

    if (isCreator && task.recurrence_series_id && !['completed', 'cancelled'].includes(task.status)) {
      out.push({ label: 'Отменить серию...', action: 'cancelSeries', danger: true })
    }

    return out
  }

  const handleCancelSeries = async () => {
    if (!task?.recurrence_series_id) return
    setActionInProgress(true)
    setError(null)
    try {
      let url = `/api/tasks/series/${task.recurrence_series_id}`
      if (cancelSeriesMode === 'future' && task.due_date) url += `?from_date=${task.due_date}`
      const resp = await fetch(url, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Не удалось отменить серию')
        return
      }
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setActionInProgress(false)
      setShowCancelSeriesDialog(false)
    }
  }

  const handleAction = async (action: ActionKey, withReason?: boolean) => {
    if (action === 'cancelSeries') {
      setShowCancelSeriesDialog(true)
      setCancelSeriesMode('future')
      setSeriesPreview(null)
      loadSeriesPreview('future')
      return
    }
    if (withReason && !declineReason.trim()) {
      setError('Укажите причину отклонения')
      return
    }
    setActionInProgress(true)
    setError(null)
    try {
      let resp: Response

      if (action === 'claim') {
        resp = await fetch(`/api/tasks/${taskId}/claim`, { method: 'POST' })
      } else if (action === 'cancel') {
        resp = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      } else {
        const STATUS_BY_ACTION: Record<Exclude<ActionKey, 'claim' | 'cancel' | 'cancelSeries'>, TaskRow['status']> = {
          start:    'in_progress',
          review:   'review',
          complete: 'completed',
          reopen:   'in_progress',
          decline:  'declined',
        }
        const newStatus = STATUS_BY_ACTION[action as Exclude<ActionKey, 'claim' | 'cancel' | 'cancelSeries'>]
        const body: Record<string, unknown> = { status: newStatus }
        if (action === 'decline' && declineReason.trim()) {
          body.status_note = declineReason.trim()
        }
        resp = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        setError(errData.error ?? 'Не удалось выполнить действие')
        return
      }

      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setActionInProgress(false)
      setShowDeclineInput(false)
      setDeclineReason('')
    }
  }

  const handleAddComment = async () => {
    if (!newCommentText.trim()) return
    setPostingComment(true)
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newCommentText.trim() }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Не удалось добавить комментарий')
        return
      }
      setNewCommentText('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setPostingComment(false)
    }
  }

  const handleAddWatcher = async () => {
    if (!newWatcherId) return
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}/watchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: newWatcherId }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Не удалось добавить наблюдателя')
        return
      }
      setNewWatcherId(null)
      setAddingWatcher(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const handleRemoveWatcher = async (personId: string) => {
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}/watchers/${personId}`, {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Не удалось снять наблюдателя')
        return
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: 48, textAlign: 'center', color: '#6B7280' }}>Загрузка…</div>
      </ModalShell>
    )
  }

  if (error && !task) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: 24, background: '#FEE2E2', color: '#991B1B', borderRadius: 8 }}>
          {error}
        </div>
      </ModalShell>
    )
  }

  if (!task) return null

  const statusColor   = STATUS_COLORS[task.status]
  const priorityColor = PRIORITY_COLORS[task.priority]
  const actions       = getAvailableActions()

  const dueDateText = task.due_date
    ? new Date(task.due_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
    : null
  const timeText = (task.due_all_day || !task.due_time) ? '' : ` к ${task.due_time.slice(0, 5)}`

  return (
    <ModalShell onClose={onClose}>
      {/* Заголовок с приоритет-баром */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, paddingRight: 32 }}>
        <div style={{ width: 4, background: priorityColor, borderRadius: 2 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#111827' }}>
            {task.title}
          </h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              background: statusColor.bg, color: statusColor.fg, borderRadius: 12,
            }}>
              {STATUS_LABELS[task.status]}
            </span>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              {PRIORITY_LABELS[task.priority]} приоритет
            </span>
            {dueDateText && (
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                • Срок: {dueDateText}{timeText}
              </span>
            )}
            {task.recurrence_series_id && (
              <span style={{
                padding: '2px 8px', fontSize: 11, background: '#FEF3C7', color: '#92400E',
                borderRadius: 8, fontWeight: 500,
              }}>
                ↻ Из серии
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Описание */}
      {task.description && (
        <div style={{
          marginTop: 16, padding: 14, background: '#F9FAFB', borderRadius: 8,
          fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap',
        }}>
          {task.description}
        </div>
      )}

      {/* Метаданные */}
      <div style={{
        marginTop: 16, padding: 12, background: '#fff', border: '1px solid #E5E7EB',
        borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
      }}>
        <Field label="Назначена" value={
          task.assignee?.full_name
            ?? (task.department ? `Отдел: ${task.department.name}` : '—')
        } />
        <Field label="Создал" value={task.creator?.full_name ?? '—'} />
        <Field label="Создана" value={new Date(task.created_at).toLocaleDateString('ru-RU')} />
        {task.completed_at && (
          <Field label="Завершена" value={new Date(task.completed_at).toLocaleDateString('ru-RU')} />
        )}
      </div>

      {/* Наблюдатели */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>
            Наблюдатели ({watchers.length})
          </div>
          {!addingWatcher && (
            <button
              onClick={() => setAddingWatcher(true)}
              style={{
                fontSize: 12, color: accent, background: 'transparent',
                border: `1px dashed ${accent}`, padding: '4px 10px',
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              + Добавить
            </button>
          )}
        </div>

        {watchers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {watchers.map(w => (
              <div key={w.person_id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: '#EFF6FF', color: '#1E40AF',
                borderRadius: 12, fontSize: 12,
              }}>
                <span>{w.person?.full_name ?? '…'}</span>
                <button
                  onClick={() => handleRemoveWatcher(w.person_id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: '#1E40AF', lineHeight: 1, padding: 0,
                  }}
                  title="Снять наблюдателя"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {addingWatcher && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <PersonSelect
                value={newWatcherId}
                onChange={id => setNewWatcherId(id)}
                placeholder="Выберите наблюдателя"
                accentColor={accent}
              />
            </div>
            <button
              onClick={handleAddWatcher}
              disabled={!newWatcherId}
              style={{
                padding: '8px 14px', fontSize: 12, color: '#fff',
                background: accent, border: 'none', borderRadius: 6,
                cursor: newWatcherId ? 'pointer' : 'not-allowed',
                opacity: newWatcherId ? 1 : 0.5,
              }}
            >
              Добавить
            </button>
            <button
              onClick={() => { setAddingWatcher(false); setNewWatcherId(null) }}
              style={{
                padding: '8px 12px', fontSize: 12, color: '#6B7280',
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      {/* Действия */}
      {actions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {!showDeclineInput && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions.map(a => (
                <button
                  key={a.action}
                  onClick={() => {
                    if (a.needsReason) setShowDeclineInput(true)
                    else handleAction(a.action)
                  }}
                  disabled={actionInProgress}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                    background: a.danger ? '#fff' : accent,
                    color: a.danger ? '#DC2626' : '#fff',
                    border: a.danger ? '1px solid #FCA5A5' : 'none',
                    borderRadius: 8,
                    cursor: actionInProgress ? 'wait' : 'pointer',
                    opacity: actionInProgress ? 0.6 : 1,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {showDeclineInput && (
            <div style={{ background: '#FEF2F2', padding: 12, borderRadius: 8 }}>
              <label style={{ fontSize: 12, color: '#991B1B', marginBottom: 6, display: 'block' }}>
                Причина отклонения:
              </label>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Опишите причину…"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid #FCA5A5', borderRadius: 6, minHeight: 60,
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setShowDeclineInput(false); setDeclineReason('') }}
                  style={{
                    padding: '6px 12px', fontSize: 12, background: '#fff',
                    border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer',
                  }}
                >Отмена</button>
                <button
                  onClick={() => handleAction('decline', true)}
                  disabled={actionInProgress || !declineReason.trim()}
                  style={{
                    padding: '6px 12px', fontSize: 12, background: '#DC2626',
                    color: '#fff', border: 'none', borderRadius: 6,
                    cursor: declineReason.trim() && !actionInProgress ? 'pointer' : 'not-allowed',
                    opacity: declineReason.trim() && !actionInProgress ? 1 : 0.5,
                  }}
                >Отклонить задачу</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Диалог отмены серии */}
      {showCancelSeriesDialog && (
        <div style={{
          marginTop: 12, padding: 14, background: '#FEF2F2',
          border: '1px solid #FCA5A5', borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 12 }}>
            Отменить серию задач?
          </div>

          {/* Выбор режима */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <label style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: 10, background: '#fff', borderRadius: 6, cursor: 'pointer',
              border: cancelSeriesMode === 'future' ? '1.5px solid #DC2626' : '1px solid #E5E7EB',
            }}>
              <input
                type="radio"
                checked={cancelSeriesMode === 'future'}
                onChange={() => setCancelSeriesMode('future')}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>
                  Только будущие задачи
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  Начиная с этой задачи и далее
                </div>
              </div>
            </label>

            <label style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: 10, background: '#fff', borderRadius: 6, cursor: 'pointer',
              border: cancelSeriesMode === 'all' ? '1.5px solid #DC2626' : '1px solid #E5E7EB',
            }}>
              <input
                type="radio"
                checked={cancelSeriesMode === 'all'}
                onChange={() => setCancelSeriesMode('all')}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>
                  Всю серию
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  Все задачи серии, включая прошедшие активные
                </div>
              </div>
            </label>
          </div>

          {/* Превью */}
          <div style={{
            padding: 10, background: '#fff', borderRadius: 6, marginBottom: 12,
            border: '1px solid #FECACA',
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Что произойдёт:
            </div>
            {loadingPreview && (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Подсчёт...</div>
            )}
            {!loadingPreview && seriesPreview && (() => {
              const bs = seriesPreview.by_status
              const willDelete  = (bs.unassigned ?? 0) + (bs.pending ?? 0) + (bs.declined ?? 0)
              const willPreserve = (bs.in_progress ?? 0) + (bs.review ?? 0)
              const alreadyDone = (bs.completed ?? 0) + (bs.cancelled ?? 0)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  {willDelete > 0 && (
                    <div style={{ color: '#991B1B' }}>
                      ✓ Будет удалено: <strong>{willDelete}</strong>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>
                        {' '}({[
                          bs.unassigned ? `${bs.unassigned} в пуле` : '',
                          bs.pending    ? `${bs.pending} к выполнению` : '',
                          bs.declined   ? `${bs.declined} отклонены` : '',
                        ].filter(Boolean).join(', ')})
                      </span>
                    </div>
                  )}
                  {willPreserve > 0 && (
                    <div style={{ color: '#92400E', fontWeight: 500 }}>
                      ⚠ Сохранятся: <strong>{willPreserve}</strong>
                      <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 400 }}>
                        {' '}({[
                          bs.in_progress ? `${bs.in_progress} в работе` : '',
                          bs.review      ? `${bs.review} на проверке` : '',
                        ].filter(Boolean).join(', ')})
                      </span>
                      <div style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>
                        Активные задачи нельзя удалить через эту операцию
                      </div>
                    </div>
                  )}
                  {alreadyDone > 0 && (
                    <div style={{ color: '#6B7280', fontSize: 11 }}>
                      Не затронуто: {alreadyDone} (завершено или ранее отменено)
                    </div>
                  )}
                  {willDelete === 0 && willPreserve === 0 && alreadyDone === 0 && (
                    <div style={{ color: '#6B7280' }}>Нет задач в выбранном диапазоне</div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowCancelSeriesDialog(false)}
              disabled={actionInProgress}
              style={{
                padding: '8px 14px', fontSize: 12, color: '#6B7280',
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6,
                cursor: 'pointer',
              }}
            >Отмена</button>
            <button
              onClick={handleCancelSeries}
              disabled={actionInProgress || loadingPreview}
              style={{
                padding: '8px 14px', fontSize: 12, color: '#fff',
                background: '#DC2626', border: 'none', borderRadius: 6,
                cursor: actionInProgress || loadingPreview ? 'wait' : 'pointer',
                opacity: actionInProgress || loadingPreview ? 0.6 : 1,
              }}
            >
              {actionInProgress ? 'Удаление…' : 'Отменить серию'}
            </button>
          </div>
        </div>
      )}

      {/* Ошибка */}
      {error && task && (
        <div style={{
          marginTop: 12, padding: 10, background: '#FEE2E2', color: '#991B1B',
          borderRadius: 6, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Комментарии */}
      <div style={{ marginTop: 20, borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: '#111827' }}>
          Комментарии ({comments.length})
        </h3>
        {comments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>
            Пока нет комментариев
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map(c => <CommentItem key={c.id} comment={c} />)}
          </div>
        )}

        <div style={{ marginTop: 12, padding: 10, background: '#F9FAFB', borderRadius: 8 }}>
          <textarea
            value={newCommentText}
            onChange={e => setNewCommentText(e.target.value)}
            placeholder="Написать комментарий…"
            disabled={postingComment}
            style={{
              width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13,
              border: '1px solid #D1D5DB', borderRadius: 6,
              boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={handleAddComment}
              disabled={postingComment || !newCommentText.trim()}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#fff',
                background: accent, border: 'none', borderRadius: 6,
                cursor: postingComment || !newCommentText.trim() ? 'not-allowed' : 'pointer',
                opacity: postingComment || !newCommentText.trim() ? 0.5 : 1,
              }}
            >
              {postingComment ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>

      {/* История изменений */}
      {history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: '#111827' }}>
            История изменений ({history.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(h => (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 10px', fontSize: 12,
                background: '#FAFAFA', borderRadius: 6,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_COLORS[h.to_status]?.fg ?? '#9CA3AF',
                  marginTop: 5, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#374151' }}>
                    <strong>{h.actor?.full_name ?? 'Система'}</strong>
                    {h.from_status ? (
                      <>: {STATUS_LABELS[h.from_status]} → {STATUS_LABELS[h.to_status]}</>
                    ) : (
                      <>: создал задачу со статусом {STATUS_LABELS[h.to_status]}</>
                    )}
                  </div>
                  {h.note && (
                    <div style={{ color: '#6B7280', marginTop: 2, fontStyle: 'italic' }}>
                      «{h.note}»
                    </div>
                  )}
                  <div style={{ color: '#9CA3AF', marginTop: 2, fontSize: 11 }}>
                    {new Date(h.created_at).toLocaleString('ru-RU', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937' }}>{value}</div>
    </div>
  )
}

function CommentItem({ comment }: { comment: Comment }) {
  const typeBg     = comment.comment_type === 'decline_reason' ? '#FEE2E2'
                   : comment.comment_type === 'status_note'    ? '#EFF6FF'
                   : '#fff'
  const typeBorder = comment.comment_type === 'decline_reason' ? '#FCA5A5'
                   : comment.comment_type === 'status_note'    ? '#BFDBFE'
                   : '#E5E7EB'
  const typeLabel  = comment.comment_type === 'decline_reason' ? 'Причина отклонения'
                   : comment.comment_type === 'status_note'    ? 'Системная заметка'
                   : ''

  return (
    <div style={{ padding: 10, background: typeBg, border: `1px solid ${typeBorder}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
          {comment.author?.full_name ?? 'Пользователь'}
        </span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          {new Date(comment.created_at).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>
      {typeLabel && (
        <div style={{ fontSize: 10, color: '#6B7280', fontStyle: 'italic', marginBottom: 4 }}>
          {typeLabel}
        </div>
      )}
      <div style={{ fontSize: 13, color: '#1F2937', whiteSpace: 'pre-wrap' }}>
        {comment.content}
      </div>
    </div>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          position: 'relative',
        }}
      >
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer',
          lineHeight: 1,
        }}>×</button>
        {children}
      </div>
    </div>
  )
}
