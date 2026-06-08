# Система прав (RBAC)

Доступ строится на ролях и привилегиях с областью действия (scope).

## Таблицы

| Таблица | Назначение |
|---------|-----------|
| `roles` | Каталог ролей (`code`, `name`, `category`, `is_system`) |
| `module_privileges` | Каталог привилегий по модулям (`module`, `privilege_code`, `privilege_name`) |
| `role_privileges` | Привилегии роли: `role_id`, `module`, `privilege_code`, `scope` |
| `person_roles` | Назначение ролей человеку (`person_id`, `role_id`) |
| `person_privileges` | Точечные оверрайды на человека (`is_granted`, `expires_at`, `reason`) |

Роли определены также как union-тип `RoleCode` в `types/database.ts`
(на момент написания — 32 кода: `superadmin`, `tech_admin`,
`campus_president`, `rector`, `dean`, `teacher`, `student`, `sponsor`,
`alumni` и т.д.). Источник правды — таблица `roles` в БД.

## Scope (область действия)

`role_privileges.scope` ∈ `'all' | 'department' | 'own'`:

- **`all`** — действие разрешено везде.
- **`department`** — только в подразделениях пользователя (его активные
  `staff_positions`). Если объект не привязан к department — доступ как к
  общему пулу.
- **`own`** — только если пользователь является ответственным за объект
  (например, `teacher_id` урока).

При нескольких ролях с одной привилегией берётся **максимальный** scope
(приоритет: `all` > `department` > `own`).

## Middleware: доступ к модулю

`middleware.ts` для страниц `/dashboard/<moduleCode>` проверяет, есть ли у
ролей пользователя запись в `role_privileges` с
`privilege_code = 'access'` для этого модуля.

- Защищаемые модули — набор `PROTECTED_MODULES` (`persons`, `education`,
  `finance`, `dormitory`, `food`, `security`, `alumni`, `sponsors`,
  `documents`, `reports`, `settings`, `doctor`, `psychologist`,
  `maintenance`, `applicants`, `contacts`).
- `superadmin` обходит проверку.
- Нет доступа → redirect на `/dashboard`.

## Helpers

### Роли — `lib/auth/permissions.ts`

```ts
hasRole(code)          // есть ли у текущей сессии роль
hasAnyRole(codes)      // есть ли хотя бы одна из ролей
isSuperAdmin()
requireSession()       // бросает 'UNAUTHORIZED', если нет сессии
```

### Education-привилегии — `lib/education/permissions.ts`

Тонкая проверка с учётом scope. Привилегии — union `EducationPrivilege`
(`view_leads`, `manage_leads`, `convert_lead`, `view_applicants`,
`manage_applicants`, `manage_students`, `manage_class_groups`,
`set_grades`, `mark_attendance` и т.д.).

```ts
// boolean-проверки
hasEducationPrivilege(session, privilege, target?)  // с учётом scope/target
canDoEducationInAny(session, privilege)             // «может хоть где-то» (для UI)
getEducationPrivilegeScope(session, privilege)      // вернуть scope | null

// throw-версия для API (401/403)
requireEducationPrivilege(privilege, target?)       // возвращает session при успехе
```

`PrivilegeTarget`:

```ts
interface PrivilegeTarget {
  department_id?: string   // для scope='department'
  teacher_ids?: string[]   // для scope='own'
}
```

Привилегии и подразделения кэшируются в памяти на 30 секунд
(`clearPermissionsCache(personId?)` сбрасывает кэш).

## Паттерн `pickPrivilege`

Привилегия для journey зависит от его `education_status`. Этот хелпер
повторяется в нескольких API-роутах (`app/api/workflow/...`,
`app/api/education/journeys/...`):

```ts
type EduWriteScope = 'view' | 'manage'

function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}
```

Использование в route handler:

```ts
await requireEducationPrivilege(pickPrivilege(eduStatus, 'manage'), target)
```

## Принцип

**Каждый API-endpoint обязан проверять права** — либо через
`requireEducationPrivilege` (с подходящим target), либо через
`requireSession` + ролевые проверки. Middleware закрывает только доступ к
модулю целиком, а не к конкретным операциям.
