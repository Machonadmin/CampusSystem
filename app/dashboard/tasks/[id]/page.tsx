'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useSafeBack } from '@/lib/hooks/useSafeBack'
import AddToCalendar from '@/components/calendar/AddToCalendar'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useTaskDetail } from '../components/useTaskDetail'
import TaskDetailBody from '../components/TaskDetailBody'

/**
 * Полностраничная карточка задачи (/dashboard/tasks/[id]). Делит логику
 * (useTaskDetail) и тело (<TaskDetailBody/>) с модалкой TaskDetailModal —
 * раньше это были две копии по ~877 строк. Отличия страницы: хлебные крошки,
 * градиентный хедер, «в календарь» и то, что после действия она остаётся здесь
 * (перезагрузка) либо уходит к списку (удаление/отмена серии).
 */
export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const t = useTranslations('tasks')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const accent = getModuleColor('tasks')
  // «Назад» = реальная история (вернуться на ТОТ экран, откуда пришли), с
  // запасным родителем — списком задач, если истории нет.
  const goBack = useSafeBack('/dashboard/tasks')

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.person_id) setCurrentUserId(d.person_id) })
      .catch(() => {})
  }, [])

  const d = useTaskDetail({
    taskId,
    currentUserId,
    reloadOnOpenAction: true,
    onAfterAction: (kind) => { if (kind === 'gone') router.push('/dashboard/tasks') },
  })

  const task = d.task

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/tasks' },
        { label: d.loading ? '…' : (task?.title ?? t('title')) },
      ]} />

      <ModuleHeader
        module="tasks"
        compact
        icon={
          <button
            onClick={goBack}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6,
              color: 'var(--text)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >
            ← {tCommon('back')}
          </button>
        }
        title={d.loading ? tCommon('loading') : (task?.title ?? t('title'))}
      />

      {d.loading && <SkeletonRows />}

      {d.error && !task && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          {d.error}
        </div>
      )}

      {!d.loading && task && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 24, maxWidth: 720,
        }}>
          <TaskDetailBody
            d={d}
            accent={accent}
            headerExtra={
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
            }
          />
        </div>
      )}
    </div>
  )
}
