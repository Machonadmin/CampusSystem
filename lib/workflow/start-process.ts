/**
 * Тип результата запуска процесса. Сам запуск теперь выполняется атомарно в
 * Postgres — RPC start_process (см. migrations/20260702210000_*.sql); этот
 * интерфейс — форма ответа RPC, используется в /api/applications и
 * /api/education/leads.
 *
 * Прежние помощники mapTaskTemplate/createStartingTasks и функция startProcess
 * удалены: вся логика запуска процесса и создания стартовых задач подэтапов
 * переехала в PL/pgSQL (start_process, reactivate_stage, complete_stage,
 * handle_task_completion).
 */
export interface StartProcessResult {
  process_instance_id: string
  stage_instance_ids: string[]
  already_existed: boolean
}
