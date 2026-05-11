import { createServerClient } from '@/lib/supabase/server'
import { getPersonDepartments } from './helpers'
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
}

/**
 * Вычисляет права текущего пользователя на задачу.
 * Делает 0–2 дополнительных запроса (watchers, отделы) — только если нужны.
 */
export async function getTaskAccess(
  task: TaskRow,
  personId: string,
  roles: string[],
): Promise<TaskAccess> {
  const isSuperadmin = roles.includes('superadmin')
  const isCreator = task.creator_id === personId
  const isAssignee = task.assignee_id === personId

  let isWatcher = false
  let isInDepartment = false

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
  }

  const canView = isSuperadmin || isCreator || isAssignee || isWatcher || isInDepartment
  const canEdit = isSuperadmin || isCreator
  const canChangeStatus = isSuperadmin || isCreator || isAssignee
  const canDelete = isSuperadmin || isCreator

  return {
    canView, canEdit, canChangeStatus, canDelete,
    isCreator, isAssignee, isWatcher, isInDepartment, isSuperadmin,
  }
}
