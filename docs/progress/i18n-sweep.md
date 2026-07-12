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
    then the raw `code`. **Scope-safe**: `getCookieLocale()` is wrapped in try/catch
    (it calls `cookies()` which throws outside a request, e.g. in unit tests that
    call `mapDbError` directly) → defaults to `ru`, so behaviour and tests are
    unchanged.
  - `apiError(code, status, extra?)` → `NextResponse.json({ error: serverT(code), code, ...extra }, { status })`.
    **Keeps** the `error` string field (old clients reading `body.error` still work),
    **adds** a machine-stable `code`. `extra` preserves fields like zod `details`
    or the food-enrollment `reason`.
- **`errors` namespace** in `messages/{ru,he,en}.json` — **315 keys**, identical key
  sets (parity test passes). Generated from a single master dict (`code → {ru,he,en}`)
  validated 1:1 against the exact source literals, so parity holds by construction.
- **`middleware.ts`** (Edge runtime): inlined 3-string locale map, reads
  `request.cookies.get('campus_locale')`, returns `{ error, code:'unauthorized' }`
  (status 401 unchanged).
- **`lib/api/handler.ts`** (`mapPgError`/`jsonError`/`parseBody`) and every
  per-module `lib/*/http.ts` `mapDbError` + `lib/*/permissions.ts` now translate via
  `serverT`. **No control-flow, status, or shape change** beyond the added `code`;
  DB/RPC `error.message` pass-through preserved (only hardcoded fallbacks translated).

### How the migration was applied
A verified regex transformer rewrote four conservative patterns, each firing only
on a cyrillic literal that maps to a known code:
`NextResponse.json({error:'…'},{status:N})`→`apiError('code',N)`;
`message:'…'`, `?? '…'`, `new Error('…')`→`serverT('code')`.
**1112 automated transforms across 193 files + 9 manual edits.** Full tree verified
`tsc --noEmit` clean and `vitest` 417/417 green, then committed per module.

## Per-module status — API errors

Legend: ✅ done+committed · ⬜ pending · ⏭️ skipped(logged)

| Phase | API errors | UI strings |
|---|---|---|
| foundation (helper, ns, middleware, handler.ts) | ✅ 3a3430c / 78c619d | — |
| persons · staff · education · finance · dormitory | ✅ | ⬜ |
| food · doctor · psychologist · documents · workflow | ✅ | ⬜ |
| tasks · security · sponsors · alumni · contacts | ✅ | ⬜ |
| settings · applications · public · calendar · reports | ✅ | ⬜ |
| references · quality-control · maintenance · students · auth | ✅ | ⬜ |

All 25 API modules committed (`git log machon/main..HEAD`, 27 commits total).
`tsc` ✅ · `vitest` ✅ 417 at every commit.

## Counts

- API error literals migrated: **276 distinct / 633 occurrences** (`error:`/`message:`)
  + **98** `new Error('…')` + **293** `?? '…'` fallbacks. `errors` namespace: **315 keys × 3**.
- Shared surfaces translated: `lib/api/handler.ts`, 13× `lib/*/http.ts` `mapDbError`,
  ~17× `lib/*/permissions.ts`, `lib/tasks/{helpers,recurrence}.ts`, `middleware.ts`.

## Skipped / deferred (must review) — interpolated `${…}` errors

These are template literals with runtime interpolation. Translating them needs a
**parameterised** message mechanism (the current `serverT`/`apiError` do not
interpolate); doing it by hand risks changing behaviour/grammar in 3 languages
(esp. Hebrew RTL with mid-string values), so they are **deferred, not guessed**.
17 messages remain in Russian:

- `app/api/education/assessments/[id]/grades/route.ts` (×4: numeric-score / negative / exceeds-max / not-enrolled)
- `app/api/education/assessments/[id]/route.ts` (max_score lower than existing grades)
- `app/api/education/class-groups/[id]/enrollments/route.ts` (Journey не найдены: …)
- `app/api/education/class-groups/[id]/route.ts` & `study-groups/[id]/route.ts` (cannot delete group — N students)
- `app/api/education/class-groups/[id]/schedule/generate/route.ts` (period too large)
- `app/api/education/journeys/route.ts` (Создание person: …)
- `app/api/education/lessons/[lessonId]/attendance/route.ts` (×2: invalid status incl. `(пусто)` fallback / not-enrolled)
- `app/api/finance/payments/[id]/approve/route.ts` (confirm only pending payment)
- `app/api/settings/quality-templates/[id]/route.ts` (template used in N checks)
- `app/api/tasks/[id]/route.ts` (Переход A → B запрещён)
- `lib/tasks/recurrence.ts` (×2: `Максимум ${SERIES_LIMIT} …`, `Серия превышает лимит …`)

**Done via prefix-translation** (dynamic part preserved): the 4 identical
`Недопустимый переход статуса: ${a} → ${b}` sites (doctor/maintenance/psychologist/
security) → `${serverT('invalid_status_transition')}: ${a} → ${b}`.

Also intentionally left: a few latin-only field-format messages in
`lib/tasks/recurrence.ts` (`monthly_day: 1-31`, `yearly_month: 1-12`,
`yearly_day: 1-31`) — technical, language-neutral, no natural-language content.

Out of scope: Postgres `RAISE EXCEPTION` messages defined in SQL migrations
(surfaced via `error.message` pass-through) — they live in the DB, not the app.

## Next: dashboard UI strings (in progress)
~44 dashboard `.tsx` + `components/ui/*` with hardcoded Cyrillic JSX / confirm() /
alert(). Migrating per module with `useTranslations`.
