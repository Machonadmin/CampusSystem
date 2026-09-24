import { createServerClient } from '@/lib/supabase/server'
import { getPersonDepartments } from './helpers'
import { isMaintenanceTask } from './maintenance-link'
import { hasMaintenancePrivilege } from '@/lib/maintenance/permissions'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { TaskRow } from '@/types/database'

export type TaskAccess = {
  canView: boolean
  canEdit: boolean
  canChangeStatus: boolean
  canDelete: boolean
  isCreator: boolean
  isAssignee: boolean
  isWatcher: boolean
  isInDepartment: boolean
  isSuperadmin: boolean
  /**
   * Задача помечена как задача по эксплуатации И у пользователя есть доступ к
   * модулю «Эксплуатация». Даёт ТОЛЬКО просмотр (и, как следствие,
   * комментарии) — чтобы клик по строке на доске техслужбы открывал карточку,
   * а не 403. Менять статус и редактировать по-прежнему могут лишь автор,
   * исполнитель и суперадмин.
   */
  isMaintenanceViewer: boolean
}

/**
 * Вычисляет права текущего пользователя на задачу.
 * Делает 0–2 дополнительных запроса (watchers, отделы) — только если нужны.
 */
export async function getTaskAccess(
  task: TaskRow,
  personId: string,
  roles: string[],
  /**
   * Сессия нужна только для проверки доступа к модулю «Эксплуатация»
   * (см. isMaintenanceViewer). Не передана — проверка пропускается, поведение
   * ровно прежнее.
   */
  session?: SessionPayload | null,
): Promise<TaskAccess> {
  const isSuperadmin = roles.includes('superadmin')
  const isCreator = task.creator_id === personId
  const isAssignee = task.assignee_id === personId

  let isWatcher = false
  let isInDepartment = false
  let isMaintenanceViewer = false

  if (!isSuperadmin && !isCreator && !isAssignee) {
    const sb = createServerClient()

    const { data: watcherRow } = await sb
      .from('task_watchers')
      .select('task_id')
      .eq('task_id', task.id)
      .eq('person_id', personId)
      .maybeSingle()
    isWatcher = !!watcherRow

    if (task.department_id) {
      const myDepts = await getPersonDepartments(personId)
      isInDepartment = myDepts.includes(task.department_id)
    }

    // «Техслужба видит техслужбу»: помеченную задачу видит любой, у кого есть
    // доступ к модулю «Эксплуатация». Дополнительный запрос делается только для
    // помеченных задач и кэшируется на 30 с внутри hasMaintenancePrivilege,
    // поэтому на обычные задачи это не влияет.
    if (session && isMaintenanceTask(task.metadata)) {
      isMaintenanceViewer = await hasMaintenancePrivilege(session, 'view')
    }
  }

  const canView = isSuperadmin || isCreator || isAssignee || isWatcher || isInDepartment || isMaintenanceViewer
  const canEdit = isSuperadmin || isCreator
  const canChangeStatus = isSuperadmin || isCreator || isAssignee
  const canDelete = isSuperadmin || isCreator

  return {
    canView, canEdit, canChangeStatus, canDelete,
    isCreator, isAssignee, isWatcher, isInDepartment, isSuperadmin, isMaintenanceViewer,
  }
}
