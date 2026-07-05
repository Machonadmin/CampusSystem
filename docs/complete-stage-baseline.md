# completeStage — эталон поведения (снято на ТЕКущем TS-коде)

> **Историческая заметка:** RPC `complete_stage` написан и сверен с этим
> эталоном один в один (миграция `20260703120000`) — см.
> [workflow-engine.md](./workflow-engine.md). `lib/workflow/complete-stage.ts`
> удалён; документ ниже оставлен как запись эталона, использованного при
> конверсии, не как актуальное описание TS-кода.
>
> Записано до конверсии в RPC на реальных тестовых лидах «Набора». После
> написания RPC прогнать те же 7 сценариев и сверить один в один. Тестовые
> данные удалены после снятия. Snapshot 2026-07 (шаблон recruitment).

Легенда статусов подэтапов: contact / documents / event / decision.

| # | Сценарий | Действие | Итог: подэтапы | Задачи | process.status / finish_reason | journey | result-объект |
|---|----------|----------|----------------|--------|-------------------------------|---------|---------------|
| 1 | обычный `after_one` | contact → `done_event_skip` | contact=completed, documents=**active**, event=**skipped**, decision=waiting | contact task→completed, documents: 2 задачи создано | active / null | lead | activated=[documents], completed=false |
| 2 | `after_one` ветвление | contact → `done_event_yes` | contact=completed, documents=**active**, event=**active**, decision=waiting | documents 2 задачи, event 1 задача | active / null | lead | activated=[documents,event] |
| 3a | `after_all` (частично) | documents → `all_collected` (event ещё active) | documents=completed, event=active, decision=**waiting** | — | active / null | lead | activated=**[]**, completed=false |
| 3b | `after_all` (полно) | затем event → `feedback_received` | event=completed, decision=**active** | decision: 1 задача | active / null | lead | activated=[decision] |
| 4 | `after_all` со skipped | (из сц.1: event=skipped) documents → `all_collected` | documents=completed, event=skipped, decision=**active** | — | active / null | lead | activated=[decision] |
| 5 | `closes_process` reject | contact → `rejected` | contact=completed, documents/event/decision=**cancelled** | contact task=completed (не тронут), остальные cancelled | **cancelled** / rejected | **lead** (не конверт) | activated=[], completed=**true**, finish=rejected |
| 6 | `closes_process` convert | decision → `convert_to_applicant` | decision=completed, прочие как были (documents=completed, event=skipped) | — | **cancelled** / converted | **applicant** | activated=[], completed=true, finish=converted |
| 7a | ошибка: не найден | complete на несущ. stage id | — | — | — | — | HTTP 404 «Подэтап не найден» |
| 7b | ошибка: не активен | complete на уже completed stage | — | — | — | — | HTTP 400 «Подэтап не активен» |

## Ключевые подтверждённые факты (что RPC обязан воспроизвести)

- **Сц.1:** `event` уходит в `skipped` СРАЗУ при завершении contact через
  `done_event_skip` (шаг 5b в том же вызове), а не остаётся `waiting`. Прозаик
  в recruitment-template.md был неточен — эталон = реальность.
- **Сц.3:** `after_all` не активирует decision, пока оба предшественника не
  терминальны; `activated_stage_ids=[]` на первом завершении.
- **Сц.4:** `after_all` считает `skipped`-предшественника удовлетворяющим
  (decision активируется при documents=completed + event=skipped).
- **Сц.5 и 6:** ветка A (`closes_process`) ставит процессу статус
  **`cancelled`** (не `completed`) в ОБОих случаях, включая успешную
  конверсию. `finish_reason` при этом corректный (rejected / converted).
- **Сц.6:** конверсия journey → `applicant` работает; `application_date` НЕ
  проверялся здесь (по тонкости №3 — не трогаем).
- **Сц.7:** 404 для не найден, 400 для не активен — должны сохраниться через
  jsonError (P0002 / 22023).
