/**
 * Seed-скрипт: создаёт шаблон процесса «Набор» (recruitment) со всей структурой
 * через готовое CRUD API (этап 2A).
 *
 * Idempotent: повторный запуск не создаёт дублей — существующие сущности
 * (шаблон, подэтапы, задачи, финалы, переходы) пропускаются.
 *
 * Запуск:
 *   SEED_AUTH_COOKIE="<значение cookie campus_session>" npm run seed:workflow-recruitment
 *
 * Опционально:
 *   SEED_BASE_URL="http://localhost:3000"  (по умолчанию localhost:3000)
 */

const BASE_URL = process.env.SEED_BASE_URL || 'http://localhost:3000'
const RAW_COOKIE = process.env.SEED_AUTH_COOKIE

if (!RAW_COOKIE) {
  console.error(`
❌ Не задана переменная SEED_AUTH_COOKIE.

Как получить значение:
  1. Залогинься суперадмином в приложении (${BASE_URL}).
  2. Открой DevTools → Application → Cookies → ${BASE_URL}.
  3. Скопируй значение cookie с именем 'campus_session'.
  4. Запусти скрипт:
       SEED_AUTH_COOKIE="<вставь_значение>" npm run seed:workflow-recruitment

Можно вставить как просто значение, так и целиком 'campus_session=...'.
`)
  process.exit(1)
}

// Позволяем передать как голое значение, так и 'campus_session=...'
const COOKIE = RAW_COOKIE.includes('campus_session=')
  ? RAW_COOKIE
  : `campus_session=${RAW_COOKIE}`

type ApiResult<T> = { status: number; data: T }

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: COOKIE,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  return { status: res.status, data: data as T }
}

function fail(context: string, r: ApiResult<any>): never {
  console.error(`❌ ${context} — HTTP ${r.status}:`, r.data)
  process.exit(1)
}

// ─── Данные шаблона ───────────────────────────────────────────────────────────

const PROCESS = {
  code: 'recruitment',
  name_ru: 'Набор',
  description: 'Процесс работы с лидом до перевода в абитуриенты',
}

interface StageSpec {
  code: string
  name_ru: string
  has_tasks: boolean
  has_action_log: boolean
  is_optional: boolean
  is_addable: boolean
  sort_order: number
}

const STAGES: StageSpec[] = [
  { code: 'contact',   name_ru: 'Контакт',     has_tasks: false, has_action_log: true, is_optional: false, is_addable: false, sort_order: 10 },
  { code: 'documents', name_ru: 'Документы',   has_tasks: true,  has_action_log: true, is_optional: false, is_addable: false, sort_order: 20 },
  { code: 'event',     name_ru: 'Мероприятие', has_tasks: false, has_action_log: true, is_optional: true,  is_addable: false, sort_order: 30 },
  { code: 'decision',  name_ru: 'Решение',     has_tasks: true,  has_action_log: true, is_optional: false, is_addable: false, sort_order: 40 },
]

interface TaskSpec {
  stage: string
  code: string
  title: string
  default_assignee_type: string
  default_priority: string
  default_due_days: number
  sort_order: number
}

const TASKS: TaskSpec[] = [
  { stage: 'documents', code: 'request_docs',  title: 'Запросить документы',       default_assignee_type: 'creator', default_priority: 'normal', default_due_days: 7, sort_order: 10 },
  { stage: 'decision',  code: 'make_decision', title: 'Принять решение по лиду',    default_assignee_type: 'creator', default_priority: 'high',   default_due_days: 3, sort_order: 10 },
]

interface FinalSpec {
  stage: string
  code: string
  name_ru: string
  is_positive: boolean
  sort_order: number
}

const FINALS: FinalSpec[] = [
  // contact
  { stage: 'contact', code: 'done_event_yes',   name_ru: 'Готов, записан на мероприятие', is_positive: true,  sort_order: 10 },
  { stage: 'contact', code: 'done_event_skip',  name_ru: 'Готов, мероприятие пропускаем', is_positive: true,  sort_order: 20 },
  { stage: 'contact', code: 'done_event_later', name_ru: 'Готов, мероприятие отложено',   is_positive: true,  sort_order: 30 },
  // documents
  { stage: 'documents', code: 'all_collected', name_ru: 'Все собраны',       is_positive: true,  sort_order: 10 },
  { stage: 'documents', code: 'partial',       name_ru: 'Частично собраны',  is_positive: true,  sort_order: 20 },
  { stage: 'documents', code: 'not_provided',  name_ru: 'Не предоставил',    is_positive: false, sort_order: 30 },
  // event
  { stage: 'event', code: 'feedback_received', name_ru: 'Обратная связь получена', is_positive: true,  sort_order: 10 },
  { stage: 'event', code: 'no_show',           name_ru: 'Не приехал',              is_positive: false, sort_order: 20 },
  { stage: 'event', code: 'refused',           name_ru: 'Отказ от приезда',        is_positive: false, sort_order: 30 },
  // decision
  { stage: 'decision', code: 'convert_to_applicant', name_ru: 'Перевести в абитуриенты', is_positive: true,  sort_order: 10 },
  { stage: 'decision', code: 'rejected',             name_ru: 'Отказ',                   is_positive: false, sort_order: 20 },
  { stage: 'decision', code: 'postponed',            name_ru: 'Отложено',                is_positive: false, sort_order: 30 },
]

interface TransitionSpec {
  from: string | null   // код подэтапа или null (начальный)
  to: string            // код подэтапа
  trigger: string | null
  mode: 'after_one' | 'after_all'
}

const TRANSITIONS: TransitionSpec[] = [
  // начальный
  { from: null, to: 'contact', trigger: null, mode: 'after_one' },
  // после contact
  { from: 'contact', to: 'documents', trigger: 'done_event_yes',   mode: 'after_one' },
  { from: 'contact', to: 'documents', trigger: 'done_event_skip',  mode: 'after_one' },
  { from: 'contact', to: 'documents', trigger: 'done_event_later', mode: 'after_one' },
  { from: 'contact', to: 'event',     trigger: 'done_event_yes',   mode: 'after_one' },
  { from: 'contact', to: 'event',     trigger: 'done_event_later', mode: 'after_one' },
  // documents/event -> decision (after_all)
  { from: 'documents', to: 'decision', trigger: 'all_collected', mode: 'after_all' },
  { from: 'documents', to: 'decision', trigger: 'partial',       mode: 'after_all' },
  { from: 'documents', to: 'decision', trigger: 'not_provided',  mode: 'after_all' },
  { from: 'event', to: 'decision', trigger: 'feedback_received', mode: 'after_all' },
  { from: 'event', to: 'decision', trigger: 'no_show',           mode: 'after_all' },
  { from: 'event', to: 'decision', trigger: 'refused',           mode: 'after_all' },
]

// ─── Основная логика ────────────────────────────────────────────────────────────

async function main() {
  console.log(`▶ Seed «Набор» на ${BASE_URL}\n`)

  // a. process_template
  let templateId: string
  const createTpl = await api('POST', '/api/workflow/process-templates', PROCESS)
  if (createTpl.status === 201) {
    templateId = createTpl.data.id
    console.log(`Создан шаблон Набор: ${templateId}`)
  } else if (createTpl.status === 409) {
    const found = await api('GET', `/api/workflow/process-templates?code=recruitment&active_only=false`)
    if (found.status !== 200 || !found.data.templates?.length) fail('Поиск существующего шаблона', found)
    templateId = found.data.templates[0].id
    console.log(`Шаблон Набор уже существует: ${templateId}`)
  } else {
    fail('Создание шаблона', createTpl)
  }

  // Загружаем текущую структуру для idempotency
  const detail = await api('GET', `/api/workflow/process-templates/${templateId}`)
  if (detail.status !== 200) fail('Загрузка структуры шаблона', detail)

  const stageIdByCode = new Map<string, string>()
  for (const s of detail.data.stages ?? []) stageIdByCode.set(s.code, s.id)

  // Существующие задачи/финалы по ключу (stageId::code)
  const existingTasks = new Set<string>(
    (detail.data.task_templates ?? []).map((t: any) => `${t.stage_template_id}::${t.code}`)
  )
  const existingFinals = new Set<string>(
    (detail.data.finals ?? []).map((f: any) => `${f.stage_template_id}::${f.code}`)
  )
  // Существующие переходы по ключу from::to::trigger
  const existingTransitions = new Set<string>(
    (detail.data.transitions ?? []).map(
      (tr: any) => `${tr.from_stage_template_id ?? 'NULL'}::${tr.to_stage_template_id}::${tr.trigger_final_code ?? 'NULL'}`
    )
  )

  // b. подэтапы
  for (const stage of STAGES) {
    if (stageIdByCode.has(stage.code)) {
      console.log(`Подэтап ${stage.code} уже существует: ${stageIdByCode.get(stage.code)}`)
      continue
    }
    const r = await api('POST', '/api/workflow/stage-templates', {
      process_template_id: templateId,
      code: stage.code,
      name_ru: stage.name_ru,
      has_tasks: stage.has_tasks,
      has_action_log: stage.has_action_log,
      is_optional: stage.is_optional,
      is_addable: stage.is_addable,
      sort_order: stage.sort_order,
    })
    if (r.status !== 201) fail(`Создание подэтапа ${stage.code}`, r)
    stageIdByCode.set(stage.code, r.data.id)
    console.log(`Создан подэтап ${stage.code}: ${r.data.id}`)
  }

  // c. задачи
  for (const task of TASKS) {
    const stageId = stageIdByCode.get(task.stage)!
    if (existingTasks.has(`${stageId}::${task.code}`)) {
      console.log(`Задача ${task.code} уже существует`)
      continue
    }
    const r = await api('POST', '/api/workflow/stage-task-templates', {
      stage_template_id: stageId,
      code: task.code,
      title: task.title,
      default_assignee_type: task.default_assignee_type,
      default_priority: task.default_priority,
      default_due_days: task.default_due_days,
      sort_order: task.sort_order,
    })
    if (r.status !== 201) fail(`Создание задачи ${task.code}`, r)
    console.log(`Создана задача ${task.code}: ${r.data.id}`)
  }

  // d. финалы
  for (const final of FINALS) {
    const stageId = stageIdByCode.get(final.stage)!
    if (existingFinals.has(`${stageId}::${final.code}`)) {
      console.log(`Финал ${final.code} уже существует`)
      continue
    }
    const r = await api('POST', '/api/workflow/stage-finals', {
      stage_template_id: stageId,
      code: final.code,
      name_ru: final.name_ru,
      is_positive: final.is_positive,
      sort_order: final.sort_order,
    })
    if (r.status !== 201) fail(`Создание финала ${final.code}`, r)
    console.log(`Создан финал ${final.code}: ${r.data.id}`)
  }

  // e. переходы
  for (const tr of TRANSITIONS) {
    const fromId = tr.from ? stageIdByCode.get(tr.from)! : null
    const toId = stageIdByCode.get(tr.to)!
    const key = `${fromId ?? 'NULL'}::${toId}::${tr.trigger ?? 'NULL'}`
    const label = `${tr.from ?? '(start)'} -> ${tr.to}${tr.trigger ? ` (${tr.trigger})` : ''}`

    if (existingTransitions.has(key)) {
      console.log(`Переход ${label} уже существует`)
      continue
    }
    const r = await api('POST', '/api/workflow/stage-transitions', {
      from_stage_template_id: fromId,
      to_stage_template_id: toId,
      trigger_final_code: tr.trigger,
      activation_mode: tr.mode,
    })
    if (r.status !== 201) fail(`Создание перехода ${label}`, r)
    console.log(`Создан переход ${label}: ${r.data.id}`)
  }

  console.log(`\n✅ Готово. Шаблон «Набор» (${templateId}) полностью заведён.`)
}

main().catch(err => {
  console.error('❌ Непредвиденная ошибка:', err)
  process.exit(1)
})
