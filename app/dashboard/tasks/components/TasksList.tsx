'use client'

import type { TaskRow } from '@/types/database'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateShort } from '@/lib/i18n/format-date'
import AddToCalendar from '@/components/calendar/AddToCalendar'

interface Props {
  tasks: TaskRow[]
  onTaskClick: (taskId: string) => void
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
  low:    'var(--text-faint)',
  normal: 'var(--text-muted)',
  high:   '#F59E0B',
  urgent: '#DC2626',
}

export default function TasksList({ tasks, onTaskClick }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.map(t => (
        <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
      ))}
    </div>
  )
}

function TaskCard({ task, onClick }: { task: TaskRow; onClick: () => void }) {
  const t = useTranslations('tasks')
  const { lang } = useLang()
  const status = STATUS_COLORS[task.status]
  const priorityColor = PRIORITY_COLORS[task.priority]
  const dueText = formatDue(task.due_date, task.due_time, task.due_all_day, lang)
  const isOverdue =
    !!task.due_date &&
    task.due_date < new Date().toISOString().slice(0, 10) &&
    !['completed', 'cancelled', 'declined'].includes(task.status)

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      {/* Priority bar */}
      <div style={{ width: 4, background: priorityColor, flexShrink: 0 }} />

      {/* Content */}
      <div style={{ padding: '12px 16px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text)',
            flex: 1, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {task.title}
          </div>

          <span style={{
            padding: '2px 8px', fontSize: 11, fontWeight: 600,
            background: status.bg, color: status.fg, borderRadius: 12,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t(`status.${task.status}`, task.status)}
          </span>

          {dueText && (
            <span style={{
              fontSize: 12,
              color: isOverdue ? '#DC2626' : 'var(--text-muted)',
              fontWeight: isOverdue ? 600 : 400,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {dueText}
            </span>
          )}
        </div>

        {task.description && (
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', marginBottom: 6,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {task.description}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-faint)' }}>
          <span>{t(`module.${task.module}`, task.module)}</span>
          {task.recurrence_series_id && (
            <span style={{
              padding: '1px 8px', background: '#FEF3C7', color: '#92400E',
              borderRadius: 8, fontWeight: 500,
            }}>
              {t('card.series')}
            </span>
          )}
          <span style={{ marginInlineStart: 'auto' }} onClick={e => e.stopPropagation()}>
            <AddToCalendar
              variant="link"
              defaultTitle={task.title}
              defaultDate={task.due_date ?? undefined}
              defaultTime={!task.due_all_day && task.due_time ? task.due_time.slice(0, 5) : undefined}
              sourceType="task"
              sourceId={task.id}
              link={`/dashboard/tasks/${task.id}`}
            />
          </span>
        </div>
      </div>
    </div>
  )
}

function formatDue(date: string | null, time: string | null, allDay: boolean, lang: string): string | null {
  if (!date) return null
  const short = formatDateShort(date, lang)
  if (allDay || !time) return short
  return `${short} ${time.slice(0, 5)}`
}
