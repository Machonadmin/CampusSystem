'use client'

import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { useTaskDetail } from './useTaskDetail'
import TaskDetailBody from './TaskDetailBody'

/**
 * Карточка задачи в модалке. Вся логика — в useTaskDetail, всё тело — в
 * <TaskDetailBody/> (единое с полностраничной версией /dashboard/tasks/[id]).
 * После любого действия модалка закрывается: onChanged() обновит список, из
 * которого её открыли.
 */

interface Props {
  taskId: string
  currentUserId: string
  onClose: () => void
  onChanged: () => void
}

export default function TaskDetailModal({ taskId, currentUserId, onClose, onChanged }: Props) {
  const tCommon = useTranslations('common')
  const accent = getModuleColor('tasks')

  const d = useTaskDetail({
    taskId,
    currentUserId,
    onAfterAction: () => { onChanged(); onClose() },
  })

  return (
    <ModalShell onClose={onClose}>
      {d.loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>{tCommon('loading')}</div>
      ) : d.error && !d.task ? (
        <div style={{ padding: 24, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8 }}>
          {d.error}
        </div>
      ) : (
        <TaskDetailBody d={d} accent={accent} reserveCloseSpace />
      )}
    </ModalShell>
  )
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const tCommon = useTranslations('common')
  return (
    <Modal onClose={onClose} maxWidth={560} closeOnBackdrop panelStyle={{ padding: 24, position: 'relative' }}>
      <button onClick={onClose} aria-label={tCommon('close')} style={{
        position: 'absolute', top: 16, insetInlineEnd: 16,
        background: 'none', border: 'none', fontSize: 22, color: 'var(--text-faint)', cursor: 'pointer',
        lineHeight: 1,
      }}>×</button>
      {children}
    </Modal>
  )
}
