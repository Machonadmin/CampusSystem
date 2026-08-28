'use client'

import type { TaskRow } from '@/types/database'
import { todayISO } from '@/lib/dates'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateShort } from '@/lib/i18n/format-date'
import AddToCalendar from '@/components/calendar/AddToCalendar'
// STATUS_COLORS / PRIORITY_COLORS — единая копия в TaskDetailBody (идентичны).
import { STATUS_COLORS, PRIORITY_COLORS } from './TaskDetailBody'

interface Props {
  tasks: TaskRow[]
  onTaskClick: (taskId: string) => void
  // Массовый выбор (bulk). Если передан onToggleSelect — рисуем чекбоксы.
  selectedIds?: Set<string>
  onToggleSelect?: (taskId: string) => void
}

export default function TasksList({ tasks, onTaskClick, selectedIds, onToggleSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.map(t => (
        <TaskCard
          key={t.id}
          task={t}
          onClick={() => onTaskClick(t.id)}
          selectable={!!onToggleSelect}
          selected={selectedIds?.has(t.id) ?? false}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(t.id) : undefined}
        />
      ))}
    </div>
  )
}

function TaskCard({ task, onClick, selectable, selected, onToggleSelect }: {
  task: TaskRow; onClick: () => void
  selectable?: boolean; selected?: boolean; onToggleSelect?: () => void
}) {
  const t = useTranslations('tasks')
  const { lang } = useLang()
  const status = STATUS_COLORS[task.status]
  const priorityColor = PRIORITY_COLORS[task.priority]
  const dueText = formatDue(task.due_date, task.due_time, task.due_all_day, lang)
  const isOverdue =
    !!task.due_date &&
    task.due_date < todayISO() &&
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
      {/* Чекбокс массового выбора */}
      {selectable && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
          style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 12px', flexShrink: 0 }}
        >
          <input type="checkbox" checked={!!selected} readOnly style={{ width: 16, height: 16, cursor: 'pointer' }} />
        </div>
      )}

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
            background: status.bg, color: status.fg, borderRadius: 14,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t(`status.${task.status}`, task.status)}
          </span>

          {dueText && (
            <span style={{
              fontSize: 12,
              color: isOverdue ? 'var(--danger)' : 'var(--text-muted)',
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
              padding: '1px 8px', background: 'var(--warn-tint)', color: 'var(--warn)',
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
