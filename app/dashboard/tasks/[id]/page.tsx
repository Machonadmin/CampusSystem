'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate, formatDateLong, formatDateTime } from '@/lib/i18n/format-date'
import AddToCalendar from '@/components/calendar/AddToCalendar'
import type { TaskRow, TaskCommentType, TaskStatus } from '@/types/database'

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

const STATUS_COLORS: Record<TaskRow['status'], { bg: string; fg: string }> = {
  unassigned:  { bg: 'var(--surface-2)', fg: 'var(--text)' },
  pending:     { bg: '#DBEAFE', fg: '#1E40AF' },
  in_progress: { bg: '#FEF3C7', fg: '#92400E' },
  review:      { bg: '#FCE7F3', fg: '#9D174D' },
  completed:   { bg: '#D1FAE5', fg: '#065F46' },
  cancelled:   { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  declined:    { bg: '#FEE2E2', fg: '#991B1B' },
}

const PRIORITY_COLORS: Record<TaskRow['priority'], string> = {
  low: 'var(--text-faint)', normal: 'var(--text-muted)', high: '#F59E0B', urgent: '#DC2626',
}

type ActionKey = 'claim' | 'start' | 'review' | 'complete' | 'reopen' | 'decline' | 'cancel' | 'delete' | 'cancelSeries'

interface ActionDef {
  label: string
  action: ActionKey
  danger?: boolean
  needsReason?: boolean
}

export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string
  const accent = getModuleColor('tasks')
  const t = useTranslations('tasks')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

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

  const [currentUserId,     setCurrentUserId]     = useState<string | null>(null)

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
  }, [taskId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.person_id) setCurrentUserId(d.person_id) })
      .catch(() => {})
  }, [])

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
      router.push('/dashboard/tasks')
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

      if (action === 'claim') {
        resp = await fetch(`/api/tasks/${taskId}/claim`, { method: 'POST' })
      } else if (action === 'delete') {
        if (!window.confirm(t('detail.delete_confirm'))) { setActionInProgress(false); return }
        resp = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      } else if (action === 'cancel') {
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
      await load()
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
      const resp = await fetch(`/api/tasks/${taskId}/watchers/${personId}`, {
        method: 'DELETE',
      })
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

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/tasks' },
        { label: loading ? '…' : (task?.title ?? t('title')) },
      ]} />

      {/* Хедер */}
      <div style={{
        background: getModuleHeaderGradient('tasks'),
        borderRadius: 12,
        padding: '12px 24px',
        boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button
          onClick={() => router.push('/dashboard/tasks')}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
            color: '#fff', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
          }}
        >
          ← {tCommon('back')}
        </button>
        <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          {loading ? tCommon('loading') : (task?.title ?? t('title'))}
        </h1>
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {tCommon('loading')}
        </div>
      )}

      {error && !task && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && task && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 24, maxWidth: 720,
        }}>
          {/* Заголовок с приоритет-баром */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <div style={{ width: 4, background: PRIORITY_COLORS[task.priority], borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                {task.title}
              </h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  background: STATUS_COLORS[task.status].bg,
                  color: STATUS_COLORS[task.status].fg,
                  borderRadius: 12,
                }}>
                  {t(`status.${task.status}`, task.status)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t(`priority.${task.priority}`, task.priority)} {t('card.priority_suffix')}
                </span>
                {task.due_date && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    • {t('card.due_prefix')} {formatDateLong(task.due_date, lang)}{(!task.due_all_day && task.due_time) ? ` ${t('card.time_prefix')} ${task.due_time.slice(0, 5)}` : ''}
                  </span>
                )}
                {task.recurrence_series_id && (
                  <span style={{
                    padding: '2px 8px', fontSize: 11, background: '#FEF3C7', color: '#92400E',
                    borderRadius: 8, fontWeight: 500,
                  }}>
                    ↻ {t('card.from_series')}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <AddToCalendar
                  defaultTitle={task.title}
                  defaultDate={task.due_date ?? undefined}
                  defaultTime={!task.due_all_day && task.due_time ? task.due_time.slice(0, 5) : undefined}
                  sourceType="task"
                  sourceId={task.id}
                  link={`/dashboard/tasks/${task.id}`}
                />
              </div>
            </div>
          </div>

          {/* Описание */}
          {task.description && (
            <div style={{
              marginTop: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8,
              fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap',
            }}>
              {task.description}
            </div>
          )}

          {/* Метаданные */}
          <div style={{
            marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
          }}>
            <Field label={t('card.assigned_to')} value={
              task.assignee?.full_name
                ?? (task.department ? `${t('card.dept_prefix')} ${task.department.name}` : '—')
            } />
            <Field label={t('card.created_by')} value={task.creator?.full_name ?? '—'} />
            <Field label={t('card.created_at')} value={formatDate(task.created_at, lang)} />
            {task.completed_at && (
              <Field label={t('card.completed_at')} value={formatDate(task.completed_at, lang)} />
            )}
          </div>

          {/* Наблюдатели */}
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                {t('card.watchers')} ({watchers.length})
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
                  {t('card.add_watcher')}
                </button>
              )}
            </div>

            {watchers.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {watchers.map(w => (
                  <div key={w.person_id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', background: 'var(--accent-tint)', color: '#1E40AF',
                    borderRadius: 12, fontSize: 12,
                  }}>
                    <span>{w.person?.full_name ?? '…'}</span>
                    <button
                      onClick={() => handleRemoveWatcher(w.person_id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 14, color: '#1E40AF', lineHeight: 1, padding: 0,
                      }}
                      title={t('card.remove_watcher')}
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
                    placeholder={t('card.watcher_placeholder')}
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
                  {t('actions.assign')}
                </button>
                <button
                  onClick={() => { setAddingWatcher(false); setNewWatcherId(null) }}
                  style={{
                    padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {tCommon('cancel')}
                </button>
              </div>
            )}
          </div>

          {/* Действия */}
          {getAvailableActions().length > 0 && (
            <div style={{ marginTop: 16 }}>
              {!showDeclineInput && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {getAvailableActions().map(a => (
                    <button
                      key={a.action}
                      onClick={() => {
                        if (a.needsReason) setShowDeclineInput(true)
                        else handleAction(a.action)
                      }}
                      disabled={actionInProgress}
                      style={{
                        padding: '8px 16px', fontSize: 13, fontWeight: 500,
                        background: a.danger ? 'var(--surface)' : accent,
                        color: a.danger ? '#DC2626' : 'var(--surface)',
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
                    {t('card.decline_reason')}:
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder={t('card.decline_placeholder')}
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
                        padding: '6px 12px', fontSize: 12, background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                      }}
                    >{tCommon('cancel')}</button>
                    <button
                      onClick={() => handleAction('decline', true)}
                      disabled={actionInProgress || !declineReason.trim()}
                      style={{
                        padding: '6px 12px', fontSize: 12, background: '#DC2626',
                        color: '#fff', border: 'none', borderRadius: 6,
                        cursor: declineReason.trim() && !actionInProgress ? 'pointer' : 'not-allowed',
                        opacity: declineReason.trim() && !actionInProgress ? 1 : 0.5,
                      }}
                    >{t('actions.decline')}</button>
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
                {t('cancel_series.title')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(['future', 'all'] as const).map(mode => (
                  <label key={mode} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: 10, background: 'var(--surface)', borderRadius: 6, cursor: 'pointer',
                    border: cancelSeriesMode === mode ? '1.5px solid #DC2626' : '1px solid var(--border)',
                  }}>
                    <input
                      type="radio"
                      checked={cancelSeriesMode === mode}
                      onChange={() => setCancelSeriesMode(mode)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                        {mode === 'future' ? t('cancel_series.mode_future_label') : t('cancel_series.mode_all_label')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {mode === 'future'
                          ? t('cancel_series.mode_future_hint')
                          : t('cancel_series.mode_all_hint')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div style={{
                padding: 10, background: 'var(--surface)', borderRadius: 6, marginBottom: 12,
                border: '1px solid #FECACA',
              }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
                  {t('cancel_series.preview_title')}
                </div>
                {loadingPreview && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('cancel_series.counting')}</div>
                )}
                {!loadingPreview && seriesPreview && (() => {
                  const bs = seriesPreview.by_status
                  const willDelete   = (bs.unassigned ?? 0) + (bs.pending ?? 0) + (bs.declined ?? 0)
                  const willPreserve = (bs.in_progress ?? 0) + (bs.review ?? 0)
                  const alreadyDone  = (bs.completed ?? 0) + (bs.cancelled ?? 0)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                      {willDelete > 0 && (
                        <div style={{ color: '#991B1B' }}>
                          ✓ {t('cancel_series.will_delete')} <strong>{willDelete}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            {' '}({[
                              bs.unassigned ? `${bs.unassigned} ${t('cancel_series.breakdown_unassigned')}` : '',
                              bs.pending    ? `${bs.pending} ${t('cancel_series.breakdown_pending')}` : '',
                              bs.declined   ? `${bs.declined} ${t('cancel_series.breakdown_declined')}` : '',
                            ].filter(Boolean).join(', ')})
                          </span>
                        </div>
                      )}
                      {willPreserve > 0 && (
                        <div style={{ color: '#92400E', fontWeight: 500 }}>
                          ⚠ {t('cancel_series.will_preserve')} <strong>{willPreserve}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 400 }}>
                            {' '}({[
                              bs.in_progress ? `${bs.in_progress} ${t('cancel_series.breakdown_in_progress')}` : '',
                              bs.review      ? `${bs.review} ${t('cancel_series.breakdown_review')}` : '',
                            ].filter(Boolean).join(', ')})
                          </span>
                          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                            {t('cancel_series.cannot_delete_active')}
                          </div>
                        </div>
                      )}
                      {alreadyDone > 0 && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {t('cancel_series.not_affected')} {alreadyDone} ({t('cancel_series.not_affected_reason')})
                        </div>
                      )}
                      {willDelete === 0 && willPreserve === 0 && alreadyDone === 0 && (
                        <div style={{ color: 'var(--text-muted)' }}>{t('cancel_series.empty_range')}</div>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowCancelSeriesDialog(false)}
                  disabled={actionInProgress}
                  style={{
                    padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >{tCommon('cancel')}</button>
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
                  {actionInProgress ? t('cancel_series.deleting') : t('cancel_series.confirm_button')}
                </button>
              </div>
            </div>
          )}

          {/* Ошибка */}
          {error && (
            <div style={{
              marginTop: 12, padding: 10, background: '#FEE2E2', color: '#991B1B',
              borderRadius: 6, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Комментарии */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text)' }}>
              {t('card.comments')} ({comments.length})
            </h3>
            {comments.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                {t('card.no_comments')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {comments.map(c => <CommentItem key={c.id} comment={c} />)}
              </div>
            )}

            <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
              <textarea
                value={newCommentText}
                onChange={e => setNewCommentText(e.target.value)}
                placeholder={t('card.write_comment')}
                disabled={postingComment}
                style={{
                  width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border-strong)', borderRadius: 6,
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
                  {postingComment ? t('card.sending') : t('card.send')}
                </button>
              </div>
            </div>
          </div>

          {/* История изменений */}
          {history.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text)' }}>
                {t('card.history')} ({history.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map(h => (
                  <div key={h.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', fontSize: 12,
                    background: 'var(--surface-2)', borderRadius: 6,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: STATUS_COLORS[h.to_status]?.fg ?? 'var(--text-faint)',
                      marginTop: 5, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text)' }}>
                        <strong>{h.actor?.full_name ?? t('card.system_fallback')}</strong>
                        {h.from_status ? (
                          <>: {t(`status.${h.from_status}`, h.from_status)} → {t(`status.${h.to_status}`, h.to_status)}</>
                        ) : (
                          <>: {t('card.task_created')} {t(`status.${h.to_status}`, h.to_status)}</>
                        )}
                      </div>
                      {h.note && (
                        <div style={{ color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                          «{h.note}»
                        </div>
                      )}
                      <div style={{ color: 'var(--text-faint)', marginTop: 2, fontSize: 11 }}>
                        {formatDateTime(h.created_at, lang)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function CommentItem({ comment }: { comment: Comment }) {
  const t = useTranslations('tasks')
  const { lang } = useLang()
  const typeBg     = comment.comment_type === 'decline_reason' ? '#FEE2E2'
                   : comment.comment_type === 'status_note'    ? 'var(--accent-tint)'
                   : 'var(--surface)'
  const typeBorder = comment.comment_type === 'decline_reason' ? '#FCA5A5'
                   : comment.comment_type === 'status_note'    ? '#BFDBFE'
                   : 'var(--border)'
  const typeLabel  = comment.comment_type === 'decline_reason' ? t('card.decline_reason')
                   : comment.comment_type === 'status_note'    ? t('card.system_note')
                   : ''

  return (
    <div style={{ padding: 10, background: typeBg, border: `1px solid ${typeBorder}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
          {comment.author?.full_name ?? t('card.user_fallback')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {formatDateTime(comment.created_at, lang)}
        </span>
      </div>
      {typeLabel && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 4 }}>
          {typeLabel}
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {comment.content}
      </div>
    </div>
  )
}
