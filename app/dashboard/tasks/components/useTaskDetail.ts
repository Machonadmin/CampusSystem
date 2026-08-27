'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { TaskRow, TaskCommentType, TaskStatus } from '@/types/database'

/**
 * Вся логика карточки задачи (загрузка + действия + комментарии + наблюдатели +
 * история) в одном хуке. Раньше она была ДВАЖДЫ скопирована — в модалке
 * (TaskDetailModal) и на странице (/dashboard/tasks/[id]) по ~877 строк каждая.
 * Теперь обе поверхности разделяют этот хук и общее тело <TaskDetailBody/>,
 * различаясь лишь обрамлением (модалка/страница) и тем, что делать после
 * действия (закрыть модалку / перезагрузить / уйти к списку).
 *
 * onAfterAction(kind):
 *   'open' — действие сохранило задачу открытой (смена статуса, мягкая отмена);
 *   'gone' — задача исчезла отсюда (удаление, отмена серии).
 * Модалка закрывается в обоих случаях; страница перезагружается на 'open' и
 * уходит к списку на 'gone'.
 */

export interface Comment {
  id: string
  task_id: string
  author_id: string
  author?: { id: string; full_name: string; hebrew_name?: string | null } | null
  content: string
  comment_type: TaskCommentType
  created_at: string
}

export interface Watcher {
  task_id: string
  person_id: string
  added_at: string
  person?: { id: string; full_name: string; hebrew_name?: string | null } | null
}

export interface HistoryEntry {
  id: string
  task_id: string
  actor_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  note: string | null
  created_at: string
  actor?: { id: string; full_name: string; hebrew_name?: string | null } | null
}

export interface TaskDetail extends TaskRow {
  assignee?: { id: string; full_name: string; hebrew_name?: string | null } | null
  department?: { id: string; name: string } | null
  creator?: { id: string; full_name: string; hebrew_name?: string | null } | null
}

export type ActionKey =
  | 'claim' | 'start' | 'review' | 'complete' | 'reopen'
  | 'decline' | 'cancel' | 'delete' | 'cancelSeries'

export interface ActionDef {
  label: string
  action: ActionKey
  danger?: boolean
  needsReason?: boolean
}

export interface SeriesPreview {
  total: number
  by_status: Record<string, number>
}

export interface UseTaskDetailOpts {
  taskId: string
  currentUserId: string | null
  onAfterAction: (kind: 'open' | 'gone') => void
  /**
   * Полностраничная версия остаётся на месте и перезагружает задачу после
   * действия, сохранившего её ('open'); модалка вместо этого закрывается, так
   * что ей перезагрузка не нужна. Default false.
   */
  reloadOnOpenAction?: boolean
}

export function useTaskDetail({ taskId, currentUserId, onAfterAction, reloadOnOpenAction }: UseTaskDetailOpts) {
  const t = useTranslations('tasks')
  const tCommon = useTranslations('common')

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
  const [seriesPreview,          setSeriesPreview]          = useState<SeriesPreview | null>(null)
  const [loadingPreview,         setLoadingPreview]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? `${t('detail.load_error')} (${resp.status})`)
      }
      const data = await resp.json()
      setTask(data.task as TaskDetail)
      setComments((data.comments ?? []) as Comment[])
      setWatchers((data.watchers ?? []) as Watcher[])
      setHistory((data.history ?? []) as HistoryEntry[])
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => { load() }, [load])

  // После успешного действия: 'gone' — задача исчезла (модалка закрывается /
  // страница уходит к списку); 'open' — задача осталась (модалка закрывается,
  // страница перезагружает её, если reloadOnOpenAction).
  const finish = async (kind: 'open' | 'gone') => {
    if (kind === 'open' && reloadOnOpenAction) await load()
    onAfterAction(kind)
  }

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
    if (!task || !currentUserId) return []
    const isCreator  = task.creator_id  === currentUserId
    const isAssignee = task.assignee_id === currentUserId
    const out: ActionDef[] = []

    switch (task.status) {
      case 'unassigned':
        out.push({ label: t('actions.claim'), action: 'claim' })
        if (isCreator) out.push({ label: t('actions.cancel'), action: 'cancel', danger: true })
        break
      case 'pending':
        if (isAssignee) {
          out.push({ label: t('actions.start'), action: 'start' })
          out.push({ label: t('actions.decline'), action: 'decline', danger: true, needsReason: true })
        }
        if (isCreator) out.push({ label: t('actions.cancel'), action: 'cancel', danger: true })
        break
      case 'in_progress':
        if (isAssignee) out.push({ label: t('actions.send_to_review'), action: 'review' })
        if (isCreator) out.push({ label: t('actions.cancel'), action: 'cancel', danger: true })
        break
      case 'review':
        if (isCreator) {
          out.push({ label: t('actions.approve'), action: 'complete' })
          out.push({ label: t('actions.reopen'), action: 'reopen' })
        }
        break
    }

    if (isCreator && task.recurrence_series_id && !['completed', 'cancelled'].includes(task.status)) {
      out.push({ label: t('actions.cancel_series'), action: 'cancelSeries', danger: true })
    }

    // Удаление — отдельно от «Отмены»: создатель может удалить задачу совсем
    // (в любом статусе). «Отмена» же теперь мягкая (статус → cancelled).
    if (isCreator) out.push({ label: t('actions.delete'), action: 'delete', danger: true })

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
        setError(err.error ?? t('detail.cancel_series_failed'))
        return
      }
      await finish('gone')
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
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
      setError(t('detail.decline_reason_required'))
      return
    }
    setActionInProgress(true)
    setError(null)
    try {
      let resp: Response
      let gone = false

      if (action === 'claim') {
        resp = await fetch(`/api/tasks/${taskId}/claim`, { method: 'POST' })
      } else if (action === 'delete') {
        // Полное удаление — с подтверждением.
        if (!(await confirmDialog({ message: t('detail.delete_confirm'), tone: 'danger' }))) { setActionInProgress(false); return }
        resp = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
        gone = true
      } else if (action === 'cancel') {
        // Мягкая отмена: статус → cancelled (раньше здесь было жёсткое DELETE).
        resp = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }),
        })
      } else {
        const STATUS_BY_ACTION: Record<Exclude<ActionKey, 'claim' | 'cancel' | 'delete' | 'cancelSeries'>, TaskRow['status']> = {
          start:    'in_progress',
          review:   'review',
          complete: 'completed',
          reopen:   'in_progress',
          decline:  'declined',
        }
        const newStatus = STATUS_BY_ACTION[action as Exclude<ActionKey, 'claim' | 'cancel' | 'delete' | 'cancelSeries'>]
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
        setError(errData.error ?? t('detail.action_failed'))
        return
      }

      setShowDeclineInput(false)
      setDeclineReason('')
      await finish(gone ? 'gone' : 'open')
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
    } finally {
      setActionInProgress(false)
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
        setError(err.error ?? t('detail.comment_failed'))
        return
      }
      setNewCommentText('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
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
        setError(err.error ?? t('detail.add_watcher_failed'))
        return
      }
      setNewWatcherId(null)
      setAddingWatcher(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
    }
  }

  const handleRemoveWatcher = async (personId: string) => {
    setError(null)
    try {
      const resp = await fetch(`/api/tasks/${taskId}/watchers/${personId}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? t('detail.remove_watcher_failed'))
        return
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : tCommon('error'))
    }
  }

  return {
    // state
    task, comments, watchers, history,
    loading, error, actionInProgress,
    showDeclineInput, declineReason,
    newCommentText, postingComment,
    addingWatcher, newWatcherId,
    showCancelSeriesDialog, cancelSeriesMode, seriesPreview, loadingPreview,
    // setters used by the view
    setShowDeclineInput, setDeclineReason,
    setNewCommentText, setAddingWatcher, setNewWatcherId,
    setShowCancelSeriesDialog, setCancelSeriesMode,
    // handlers
    getAvailableActions, handleAction, handleCancelSeries,
    handleAddComment, handleAddWatcher, handleRemoveWatcher,
    reload: load,
  }
}
