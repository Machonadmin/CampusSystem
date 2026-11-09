import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'

/**
 * Статус проверки еврейства (בירור יהדות) на студентку. Единый источник правды,
 * который пишется из ДВУХ мест и остаётся согласованным:
 *   • модуль יהדות (ручная установка статуса + заметка);
 *   • завершение acceptance-этапа 'jewishness' (approved → verified, rejected →
 *     rejected) — реверс-синк в /api/workflow/stages/[id]/complete.
 *
 * Хранение: колонки на education_journeys (быстрый статус для списка/бейджа) +
 * append-only история jewishness_status_history (кто/когда/почему/источник).
 *
 * Статусов ровно три: pending («בבדיקה») · verified («אושר») · rejected («לא אושר»).
 *
 * Деплой-безопасно: до применения миграции колонок/таблицы ещё нет — тогда
 * функция тихо возвращает false (42703 undefined_column / 42P01 undefined_table).
 */

// Владелец (M16, 2026-10-08): ровно ТРИ статуса —
//   'verified' = «אושר», 'pending' = «בבדיקה» (пока в проверке статус можно
//   менять), 'rejected' = «לא אושר».
// Прежние промежуточные статусы (initial_checked, needs_review, partial)
// упразднены; миграция 20261009150000 переводит их в 'pending'. Первичная
// проверка рава осталась ДЕЙСТВИЕМ (а не статусом): статус остаётся 'pending',
// фиксируются jewishness_initial_checked_by/at + строка истории с
// source='initial_check'.
export const JEWISHNESS_STATUSES = ['pending', 'verified', 'rejected'] as const
export type JewishnessStatus = (typeof JEWISHNESS_STATUSES)[number]

export function isJewishnessStatus(s: unknown): s is JewishnessStatus {
  return typeof s === 'string' && (JEWISHNESS_STATUSES as readonly string[]).includes(s)
}

/**
 * Любое значение из БД → один из трёх статусов. Упразднённые коды
 * (initial_checked / needs_review / partial — до применения миграции они ещё
 * могут быть в БД) и пустые/неизвестные значения считаются 'pending' («בבדיקה»).
 */
export function normalizeJewishnessStatus(s: unknown): JewishnessStatus {
  return isJewishnessStatus(s) ? s : 'pending'
}

/**
 * Финал acceptance-этапа → статус (или null, если не решающий).
 * approved → «אושר», rejected → «לא אושר». 'partial' (финал упразднён
 * миграцией, но мог остаться в старых данных) → «בבדיקה».
 */
export function finalCodeToStatus(finalCode: string | null | undefined): JewishnessStatus | null {
  if (finalCode === 'approved') return 'verified'
  if (finalCode === 'rejected') return 'rejected'
  if (finalCode === 'partial') return 'pending'
  return null
}

type SB = ReturnType<typeof createServerClient>

/**
 * Устанавливает статус верификации на journey + пишет строку истории.
 * verified/rejected считаются РЕШЕНИЕМ — фиксируем verified_by/at; для
 * pending verified_at сбрасывается. source='initial_check' — первичная проверка
 * (статус 'pending' + initial_checked_by/at). Возвращает true при успехе,
 * false — если фича ещё не мигрирована (best-effort, не бросает по MISSING).
 */
export async function setJewishnessStatus(
  sb: SB,
  opts: {
    journeyId: string
    status: JewishnessStatus
    changedBy: string | null
    note?: string | null
    /** 'initial_check' — первичная проверка рава: статус остаётся 'pending'. */
    source: 'module' | 'acceptance_stage' | 'initial_check'
  },
): Promise<boolean> {
  const { journeyId, changedBy, source } = opts
  const isInitialCheck = source === 'initial_check'
  const status: JewishnessStatus = isInitialCheck ? 'pending' : opts.status
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 2000) : null
  const nowIso = new Date().toISOString()
  // 'verified' (финал Chana) и 'rejected' — решение: фиксируем verified_by/at.
  // Первичная проверка (Moshe) — фиксируем ОТДЕЛЬНЫЕ actor-колонки, не трогая
  // финальные; статус — 'pending' («בבדיקה»).
  const decided = status === 'verified' || status === 'rejected'

  const update: Record<string, unknown> = {
    jewishness_status: status,
    jewishness_notes: note,
  }
  // Первичная проверка без заметки не стирает прежнюю заметку в карточке
  // (решение владельца 2026-10-19; раньше пустое поле её обнуляло).
  if (isInitialCheck && note === null) delete update.jewishness_notes
  if (isInitialCheck) {
    update.jewishness_initial_checked_by = changedBy
    update.jewishness_initial_checked_at = nowIso
  } else {
    update.jewishness_verified_by = decided ? changedBy : null
    update.jewishness_verified_at = decided ? nowIso : null
  }

  try {
    const { error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', journeyId)
    if (error) {
      if (isMissingRelation(error)) return false
      throw error
    }
  } catch (e) {
    if (isMissingRelation(e)) return false
    throw e
  }

  // История — best-effort (её отсутствие не отменяет обновление статуса).
  try {
    await sb.from('jewishness_status_history').insert({
      journey_id: journeyId,
      status,
      changed_by: changedBy,
      note,
      source,
    })
  } catch (e) {
    if (!isMissingRelation(e)) throw e
  }
  return true
}

/**
 * Добавляет заметку к проверке еврейства, НЕ меняя статус (решение владельца
 * 2026-11-09): можно в любом статусе, в т.ч. после «אושר». Заметка
 * ДОБАВЛЯЕТСЯ строкой истории (source='note', status = текущий статус,
 * changed_by = автор) и не заменяет основную заметку карточки.
 *
 * Возвращает true при успехе, 'not_found' — если journey нет, false — если
 * таблица/колонки ещё не мигрированы.
 */
export async function addJewishnessNote(
  sb: SB,
  opts: { journeyId: string; changedBy: string | null; note: string },
): Promise<true | false | 'not_found'> {
  const note = opts.note.trim().slice(0, 2000)
  if (!note) throw Object.assign(new Error('empty note'), { status: 400 })

  const { data: journey, error: jErr } = await sb
    .from('education_journeys')
    .select('id, jewishness_status')
    .eq('id', opts.journeyId)
    .maybeSingle()
  if (jErr) {
    if (isMissingRelation(jErr)) return false
    throw jErr
  }
  if (!journey) return 'not_found'

  const status = normalizeJewishnessStatus((journey as { jewishness_status: unknown }).jewishness_status)
  const { error } = await sb.from('jewishness_status_history').insert({
    journey_id: opts.journeyId,
    status,
    changed_by: opts.changedBy,
    note,
    source: 'note',
  })
  if (error) {
    if (isMissingRelation(error)) return false
    throw error
  }
  return true
}
