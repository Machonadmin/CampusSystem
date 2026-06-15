# Соглашения проекта

Краткий список правил и подводных камней. Полные обязательные правила — в
корневом [`/CLAUDE.md`](../CLAUDE.md).

## Supabase-клиент

`PostgrestBuilder` (то, что возвращает `sb.from(...).select()/insert()`)
**не является обычным Promise** — у него нет `.catch()` и `.finally()`.

```ts
// ❌ НЕЛЬЗЯ — упадёт production-сборка на Vercel
await sb.from('tasks').insert(row).catch(() => {})
await sb.from('tasks').select().single().catch(() => {})

// ✅ Правильно — деструктуризация error
const { error } = await sb.from('tasks').insert(row)
if (error) { /* обработать */ }

// ✅ либо try/catch вокруг await
try { await sb.from('tasks').insert(row) } catch (e) { /* … */ }
```

> Vercel-сборка строже локального `tsc`. Перед пушем всегда
> `npx tsc --noEmit`.

## `persons.full_name`

Это **GENERATED ALWAYS** колонка (склеивается из `last_name`,
`first_name`, `middle_name`). Её **нельзя** указывать в INSERT/UPDATE —
БД отклонит запись. В `PersonInsert` поле исключено.

## Проверка прав в API

Каждый route handler проверяет доступ:

```ts
// для education-операций — с учётом scope/target
const session = await requireEducationPrivilege(
  pickPrivilege(eduStatus, 'manage'),
  target,
)

// для общих случаев
const session = await requireSession()  // бросит, если нет сессии
```

Middleware закрывает доступ к модулю целиком, но **не** к конкретным
операциям — операционные проверки обязательны в самом эндпоинте.

## Embed-запросы и `is_positive`

При выборке финалов подэтапа через Supabase-embed нужно явно тянуть
`is_positive`, иначе UI не сможет покрасить кнопки финалов:

```ts
.select('finals:stage_finals(code, name_ru, is_positive)')
```

Цвет кнопки: набор «оранжевых» кодов (`postponed`, `partial`,
`done_event_later`, `no_show`) проверяется **раньше** `is_positive`
(`components/workflow/ProcessInfoBlock.tsx`).

## `has_tasks` и шаблоны задач

При добавлении первого `stage_task_templates` к подэтапу нужно выставить
`stage_templates.has_tasks = true`. Иначе движок (`startProcess` /
`completeStage`) не создаст задачи для подэтапа. Эти поля должны быть
синхронизированы.

## FK-имена не меняются при переименовании таблицы

PostgreSQL **не переименовывает** constraint-ы при `ALTER TABLE ... RENAME TO`.
Пример: таблица `applicant_profiles` была переименована в `education_journeys`,
но FK на `persons` по-прежнему называется `applicant_profiles_person_id_fkey`.

Это ломает Supabase-embed с явным именем FK:

```ts
// ❌ Ошибка — constraint с таким именем не существует
.select('persons!education_journeys_person_id_fkey(full_name)')

// ✅ Использовать отдельный запрос
const { data: journeyRow } = await sb
  .from('education_journeys').select('person_id').eq('id', journeyId).maybeSingle()
const { data: personRow } = await sb
  .from('persons').select('full_name').eq('id', journeyRow.person_id).maybeSingle()
```

Supabase embed с неверным именем FK **не бросает ошибку** — он молча
возвращает `null`. Это делает баг трудно диагностируемым.

## Insert-типы и `created_at` / `updated_at`

В `types/database.ts` Insert-типы исключают серверные поля:

```ts
export type FooInsert = Omit<FooRow, 'id' | 'created_at' | 'updated_at'>
```

При добавлении `created_at`/`updated_at` в Row не забудь исключить их в
соответствующем Insert — иначе TypeScript потребует их при вставке.

## Миграции

- Лежат в `supabase/migrations/`, применяются **вручную** через Supabase
  Dashboard → SQL Editor (не автоприменяются).
- Делай их **идемпотентными**: `ADD COLUMN IF NOT EXISTS`,
  `CREATE TABLE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` перед
  `CREATE TRIGGER`.
- **Не переписывай уже применённую миграцию** — создавай новую (иначе при
  повторном применении будут конфликты «column already exists»).
- Наполнение справочников — отдельными SQL/seed-скриптами, тоже с
  `IF NOT EXISTS`.

## Отчётность

Если миграция упала, `tsc` показал ошибки или ты отклонился от
спецификации — это **обязательно** указывается в отчёте в начале, до слова
«готово». Точность отчётов критична (подробно — в `/CLAUDE.md`).
