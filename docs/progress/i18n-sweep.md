# i18n Full Sweep — Progress

Branch: `claude/i18n-full-sweep` (off `machon/main`). **Not merged to main.**
Goal: every user-facing string (API errors, access-denied, UI text, confirm/alert)
exists in Hebrew, English, Russian. Autonomous best-effort translation; anything
that would change **behaviour/logic** is skipped and logged, never guessed.

> Note on prior WIP: an unrelated `claude/sidebar-grouping` working tree
> (AddEmployeeModal, Sidebar, translations.ts, messages/*.json) was **stashed**
> (`git stash list` → "WIP: sidebar-grouping (auto-stashed by i18n-sweep …)") to
> branch off a clean `machon/main`. It is recoverable and was not discarded.

## Design — server-side error translation (backward-compatible)

- **`lib/i18n/api-errors.ts`**
  - `serverT(code)` — reads locale via `getCookieLocale()` (cookie `campus_locale`,
    default `ru`), returns `messages[locale].errors[code]`, falling back to `ru`
    then to the raw `code`.
  - `apiError(code, status, extra?)` → `NextResponse.json({ error: serverT(code), code, ...extra }, { status })`.
    **Keeps** the `error` string field (old clients reading `body.error` still work)
    and **adds** a machine-stable `code`. `extra` allows preserving zod `details`.
- **`errors` namespace** added to `messages/{ru,he,en}.json` — **302 keys**, identical
  key sets (parity test passes). Generated from a single master dict
  (`code → {ru,he,en}`) validated 1:1 against the exact source literals, so
  parity holds by construction.
- **`middleware.ts`** (Edge runtime — can't use `next/headers`): inlined a 3-string
  locale map, reads `request.cookies.get('campus_locale')`, returns
  `{ error, code: 'unauthorized' }` (status 401 unchanged).
- **`lib/api/handler.ts`** (shared catch/mapper used by 12+ routes): `mapPgError`,
  `jsonError`, `parseBody` now translate via `serverT`. **No control-flow, status,
  or shape change** beyond adding `code`; DB/RPC `error.message` pass-through is
  preserved (only the hardcoded fallbacks are translated). `parseBody` translates
  the top-level "validation error" prefix and preserves zod field detail.

## Namespace / keys added

- `errors.*` (302 codes) — auth/permission, generic CRUD/system, entity-not-found,
  required/empty/length, date/time & numeric/boolean format, ordering, enum/type,
  uniqueness/conflict, delete-guards, business rules, finance concurrency, calendar
  all-day, task permission/claim/series, workflow, and shared `lib/*/http.ts`
  DB-error + `lib/tasks` recurrence/helper messages.

## Skipped / uncertain (must review)

- **3 template-literal messages** contain runtime `${…}` interpolation and cannot be
  placed in a static namespace without changing interpolation behaviour — **skipped, logged**:
  - `lib/tasks/recurrence.ts`: `Максимум ${SERIES_LIMIT} повторений в серии`
  - `lib/tasks/recurrence.ts`: `Серия превышает лимит в ${SERIES_LIMIT} задач`
  - `lib/api/handler.ts`: `Ошибка валидации: ${details}` — prefix IS translated
    (`validation_error`), only the dynamic `${details}` (zod field messages) stays raw.
- Postgres `RAISE EXCEPTION` messages defined in SQL migrations (surfaced via
  `error.message` pass-through) are **out of scope** — they live in the DB, not the app.

## Per-module status

Legend: ✅ done+green+committed · 🟡 partial · ⬜ pending · ⏭️ skipped(logged)

| Module | API errors | UI strings | tsc | test | commit |
|---|---|---|---|---|---|
| **foundation** (helper, errors ns, middleware, handler.ts) | ✅ | — | ✅ | ✅ 417 | (pending) |
| persons | ⬜ | ⬜ | | | |
| staff | ⬜ | ⬜ | | | |
| education | ⬜ | ⬜ | | | |
| finance | ⬜ | ⬜ | | | |
| dormitory | ⬜ | ⬜ | | | |
| food | ⬜ | ⬜ | | | |
| doctor | ⬜ | ⬜ | | | |
| psychologist | ⬜ | ⬜ | | | |
| documents | ⬜ | ⬜ | | | |
| workflow | ⬜ | ⬜ | | | |
| tasks | ⬜ | ⬜ | | | |
| security | ⬜ | ⬜ | | | |
| sponsors | ⬜ | ⬜ | | | |
| alumni | ⬜ | ⬜ | | | |
| contacts | ⬜ | ⬜ | | | |
| settings | ⬜ | ⬜ | | | |
| applications | ⬜ | ⬜ | | | |
| public | ⬜ | ⬜ | | | |
| calendar | ⬜ | ⬜ | | | |
| reports | ⬜ | ⬜ | | | |
| references | ⬜ | ⬜ | | | |
| quality-control | ⬜ | ⬜ | | | |
| auth | ⬜ | ⬜ | | | |

## Counts

- API error literals inventoried: **276 distinct / 633 occurrences** across 179 `route.ts`.
- Shared `lib/*` error literals: **29 coverable** (+3 skipped template literals).
- `errors` namespace: **302 keys × 3 languages**.
