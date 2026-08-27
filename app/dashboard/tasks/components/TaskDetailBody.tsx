'use client'

import type { TaskRow } from '@/types/database'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate, formatDateLong, formatDateTime } from '@/lib/i18n/format-date'
import type { useTaskDetail, Comment } from './useTaskDetail'

/**
 * Общее тело карточки задачи (заголовок → метаданные → наблюдатели → действия →
 * серия → комментарии → история). Рендерится и в модалке, и на странице поверх
 * одного и того же хука useTaskDetail. Обрамление (модалка/страница/хедер) —
 * забота вызывающего; сюда оно передаёт `accent`, слот `headerExtra` (напр.
 * AddToCalendar на странице) и `reserveCloseSpace` (отступ под × в модалке).
 */

export const STATUS_COLORS: Record<TaskRow['status'], { bg: string; fg: string }> = {
  unassigned:  { bg: 'var(--surface-2)', fg: 'var(--text)' },
  pending:     { bg: 'var(--info-tint)', fg: 'var(--info)' },
  in_progress: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  review:      { bg: 'var(--violet-tint)', fg: 'var(--violet)' },
  completed:   { bg: 'var(--success-tint)', fg: 'var(--success)' },
  cancelled:   { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  declined:    { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
}

export const PRIORITY_COLORS: Record<TaskRow['priority'], string> = {
  low: 'var(--text-faint)', normal: 'var(--text-muted)', high: '#F59E0B', urgent: '#DC2626',
}

interface Props {
  d: ReturnType<typeof useTaskDetail>
  accent: string
  /** Дополнительный узел под бейджами заголовка (напр. «в календарь» на странице). */
  headerExtra?: React.ReactNode
  /** Зарезервировать место справа под кнопку × (модалка). */
  reserveCloseSpace?: boolean
}

export default function TaskDetailBody({ d, accent, headerExtra, reserveCloseSpace }: Props) {
  const t = useTranslations('tasks')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const task = d.task
  if (!task) return null

  const statusColor   = STATUS_COLORS[task.status]
  const priorityColor = PRIORITY_COLORS[task.priority]
  const actions       = d.getAvailableActions()

  const dueDateText = task.due_date ? formatDateLong(task.due_date, lang) : null
  const timeText = (task.due_all_day || !task.due_time) ? '' : ` ${t('card.time_prefix')} ${task.due_time.slice(0, 5)}`

  return (
    <>
      {/* Заголовок с приоритет-баром */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, ...(reserveCloseSpace ? { paddingRight: 32 } : null) }}>
        <div style={{ width: 4, background: priorityColor, borderRadius: 2 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text)' }}>
            {task.title}
          </h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              background: statusColor.bg, color: statusColor.fg, borderRadius: 14,
            }}>
              {t(`status.${task.status}`, task.status)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t(`priority.${task.priority}`, task.priority)} {t('card.priority_suffix')}
            </span>
            {dueDateText && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                • {t('card.due_prefix')} {dueDateText}{timeText}
              </span>
            )}
            {task.recurrence_series_id && (
              <span style={{
                padding: '2px 8px', fontSize: 11, background: 'var(--warn-tint)', color: 'var(--warn)',
                borderRadius: 8, fontWeight: 500,
              }}>
                {t('card.from_series')}
              </span>
            )}
          </div>
          {headerExtra}
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
          (task.assignee?.hebrew_name || task.assignee?.full_name)
            ?? (task.department ? `${t('card.dept_prefix')} ${task.department.name}` : '—')
        } />
        <Field label={t('card.created_by')} value={(task.creator?.hebrew_name || task.creator?.full_name) ?? '—'} />
        <Field label={t('card.created_at')} value={formatDate(task.created_at, lang)} />
        {task.completed_at && (
          <Field label={t('card.completed_at')} value={formatDate(task.completed_at, lang)} />
        )}
      </div>

      {/* Наблюдатели */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
            {t('card.watchers')} ({d.watchers.length})
          </div>
          {!d.addingWatcher && (
            <button
              onClick={() => d.setAddingWatcher(true)}
              style={{
                fontSize: 12, color: accent, background: 'transparent',
                border: `1px dashed ${accent}`, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {t('card.add_watcher')}
            </button>
          )}
        </div>

        {d.watchers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {d.watchers.map(w => (
              <div key={w.person_id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: 'var(--accent-tint)', color: 'var(--info)',
                borderRadius: 14, fontSize: 12,
              }}>
                <span>{(w.person?.hebrew_name || w.person?.full_name) ?? '…'}</span>
                <button
                  onClick={() => d.handleRemoveWatcher(w.person_id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: 'var(--info)', lineHeight: 1, padding: 0,
                  }}
                  title={t('card.remove_watcher')}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {d.addingWatcher && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <PersonSelect
                value={d.newWatcherId}
                onChange={id => d.setNewWatcherId(id)}
                placeholder={t('card.watcher_placeholder')}
                accentColor={accent}
              />
            </div>
            <button
              onClick={d.handleAddWatcher}
              disabled={!d.newWatcherId}
              style={{
                padding: '8px 14px', fontSize: 12, color: '#fff',
                background: accent, border: 'none', borderRadius: 6,
                cursor: d.newWatcherId ? 'pointer' : 'not-allowed', opacity: d.newWatcherId ? 1 : 0.5,
              }}
            >
              {t('card.add_watcher')}
            </button>
            <button
              onClick={() => { d.setAddingWatcher(false); d.setNewWatcherId(null) }}
              style={{
                padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {tCommon('cancel')}
            </button>
          </div>
        )}
      </div>

      {/* Действия */}
      {actions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {!d.showDeclineInput && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions.map(a => (
                <button
                  key={a.action}
                  onClick={() => { if (a.needsReason) d.setShowDeclineInput(true); else d.handleAction(a.action) }}
                  disabled={d.actionInProgress}
                  style={{
                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                    background: a.danger ? 'var(--surface)' : accent,
                    color: a.danger ? '#DC2626' : 'var(--surface)',
                    border: a.danger ? '1px solid #FCA5A5' : 'none',
                    borderRadius: 8,
                    cursor: d.actionInProgress ? 'wait' : 'pointer',
                    opacity: d.actionInProgress ? 0.6 : 1,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {d.showDeclineInput && (
            <div style={{ background: 'var(--danger-tint)', padding: 12, borderRadius: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 6, display: 'block' }}>
                {t('card.decline_reason')}:
              </label>
              <textarea
                value={d.declineReason}
                onChange={e => d.setDeclineReason(e.target.value)}
                placeholder={t('card.decline_placeholder')}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--danger)', borderRadius: 6, minHeight: 60,
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { d.setShowDeclineInput(false); d.setDeclineReason('') }}
                  style={{
                    padding: '6px 12px', fontSize: 12, background: 'var(--surface)',
                    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                  }}
                >{tCommon('cancel')}</button>
                <button
                  onClick={() => d.handleAction('decline', true)}
                  disabled={d.actionInProgress || !d.declineReason.trim()}
                  style={{
                    padding: '6px 12px', fontSize: 12, background: '#DC2626',
                    color: '#fff', border: 'none', borderRadius: 6,
                    cursor: d.declineReason.trim() && !d.actionInProgress ? 'pointer' : 'not-allowed',
                    opacity: d.declineReason.trim() && !d.actionInProgress ? 1 : 0.5,
                  }}
                >{t('actions.decline')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Диалог отмены серии */}
      {d.showCancelSeriesDialog && (
        <div style={{
          marginTop: 12, padding: 14, background: 'var(--danger-tint)',
          border: '1px solid var(--danger)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 12 }}>
            {t('cancel_series.title')}
          </div>

          {/* Выбор режима */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <label style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: 10, background: 'var(--surface)', borderRadius: 6, cursor: 'pointer',
              border: d.cancelSeriesMode === 'future' ? '1.5px solid #DC2626' : '1px solid var(--border)',
            }}>
              <input type="radio" checked={d.cancelSeriesMode === 'future'} onChange={() => d.setCancelSeriesMode('future')} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('cancel_series.mode_future_label')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('cancel_series.mode_future_hint')}</div>
              </div>
            </label>

            <label style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: 10, background: 'var(--surface)', borderRadius: 6, cursor: 'pointer',
              border: d.cancelSeriesMode === 'all' ? '1.5px solid #DC2626' : '1px solid var(--border)',
            }}>
              <input type="radio" checked={d.cancelSeriesMode === 'all'} onChange={() => d.setCancelSeriesMode('all')} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('cancel_series.mode_all_label')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('cancel_series.mode_all_hint')}</div>
              </div>
            </label>
          </div>

          {/* Превью */}
          <div style={{
            padding: 10, background: 'var(--surface)', borderRadius: 6, marginBottom: 12,
            border: '1px solid var(--danger)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              {t('cancel_series.preview_title')}
            </div>
            {d.loadingPreview && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('cancel_series.counting')}</div>
            )}
            {!d.loadingPreview && d.seriesPreview && (() => {
              const bs = d.seriesPreview.by_status
              const willDelete   = (bs.unassigned ?? 0) + (bs.pending ?? 0) + (bs.declined ?? 0)
              const willPreserve = (bs.in_progress ?? 0) + (bs.review ?? 0)
              const alreadyDone  = (bs.completed ?? 0) + (bs.cancelled ?? 0)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  {willDelete > 0 && (
                    <div style={{ color: 'var(--danger)' }}>
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
                    <div style={{ color: 'var(--warn)', fontWeight: 500 }}>
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

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => d.setShowCancelSeriesDialog(false)}
              disabled={d.actionInProgress}
              style={{
                padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              }}
            >{tCommon('cancel')}</button>
            <button
              onClick={d.handleCancelSeries}
              disabled={d.actionInProgress || d.loadingPreview}
              style={{
                padding: '8px 14px', fontSize: 12, color: '#fff',
                background: '#DC2626', border: 'none', borderRadius: 6,
                cursor: d.actionInProgress || d.loadingPreview ? 'wait' : 'pointer',
                opacity: d.actionInProgress || d.loadingPreview ? 0.6 : 1,
              }}
            >
              {d.actionInProgress ? t('cancel_series.deleting') : t('cancel_series.confirm_button')}
            </button>
          </div>
        </div>
      )}

      {/* Ошибка */}
      {d.error && task && (
        <div style={{
          marginTop: 12, padding: 10, background: 'var(--danger-tint)', color: 'var(--danger)',
          borderRadius: 6, fontSize: 13,
        }}>
          {d.error}
        </div>
      )}

      {/* Комментарии */}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text)' }}>
          {t('card.comments')} ({d.comments.length})
        </h3>
        {d.comments.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>
            {t('card.no_comments')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {d.comments.map(c => <CommentItem key={c.id} comment={c} />)}
          </div>
        )}

        <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
          <textarea
            value={d.newCommentText}
            onChange={e => d.setNewCommentText(e.target.value)}
            placeholder={t('card.write_comment')}
            disabled={d.postingComment}
            style={{
              width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13,
              border: '1px solid var(--border-strong)', borderRadius: 6,
              boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={d.handleAddComment}
              disabled={d.postingComment || !d.newCommentText.trim()}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#fff',
                background: accent, border: 'none', borderRadius: 6,
                cursor: d.postingComment || !d.newCommentText.trim() ? 'not-allowed' : 'pointer',
                opacity: d.postingComment || !d.newCommentText.trim() ? 0.5 : 1,
              }}
            >
              {d.postingComment ? t('card.sending') : t('card.send')}
            </button>
          </div>
        </div>
      </div>

      {/* История изменений */}
      {d.history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text)' }}>
            {t('card.history')} ({d.history.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.history.map(h => (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 10px', fontSize: 12, background: 'var(--surface-2)', borderRadius: 6,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_COLORS[h.to_status]?.fg ?? 'var(--text-faint)',
                  marginTop: 5, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text)' }}>
                    <strong>{(h.actor?.hebrew_name || h.actor?.full_name) ?? t('card.system_fallback')}</strong>
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
    </>
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
  const typeBg     = comment.comment_type === 'decline_reason' ? 'var(--danger-tint)'
                   : comment.comment_type === 'status_note'    ? 'var(--accent-tint)'
                   : 'var(--surface)'
  const typeBorder = comment.comment_type === 'decline_reason' ? 'var(--danger)'
                   : comment.comment_type === 'status_note'    ? 'var(--info)'
                   : 'var(--border)'
  const typeLabel  = comment.comment_type === 'decline_reason' ? t('card.decline_reason')
                   : comment.comment_type === 'status_note'    ? t('card.system_note')
                   : ''

  return (
    <div style={{ padding: 10, background: typeBg, border: `1px solid ${typeBorder}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
          {(comment.author?.hebrew_name || comment.author?.full_name) ?? t('card.user_fallback')}
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
