import type { SupabaseClient } from '@supabase/supabase-js'
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
 * Деплой-безопасно: до применения миграции колонок/таблицы ещё нет — тогда
 * функция тихо возвращает false (42703 undefined_column / 42P01 undefined_table).
 */

export const JEWISHNESS_STATUSES = ['pending', 'verified', 'rejected', 'needs_review', 'partial'] as const
export type JewishnessStatus = (typeof JEWISHNESS_STATUSES)[number]

export function isJewishnessStatus(s: unknown): s is JewishnessStatus {
  return typeof s === 'string' && (JEWISHNESS_STATUSES as readonly string[]).includes(s)
}

/** Финал acceptance-этапа → статус верификации (или null, если не решающий). */
export function finalCodeToStatus(finalCode: string | null | undefined): JewishnessStatus | null {
  if (finalCode === 'approved') return 'verified'
  if (finalCode === 'rejected') return 'rejected'
  if (finalCode === 'partial') return 'partial'
  return null
}

type SB = ReturnType<typeof createServerClient>

/**
 * Устанавливает статус верификации на journey + пишет строку истории.
 * verified/rejected считаются РЕШЕНИЕМ — фиксируем verified_by/at; для
 * pending/needs_review verified_at сбрасывается. Возвращает true при успехе,
 * false — если фича ещё не мигрирована (best-effort, не бросает по MISSING).
 */
export async function setJewishnessStatus(
  sb: SB,
  opts: {
    journeyId: string
    status: JewishnessStatus
    changedBy: string | null
    note?: string | null
    source: 'module' | 'acceptance_stage'
  },
): Promise<boolean> {
  const { journeyId, status, changedBy, source } = opts
  const note = opts.note?.trim() ? opts.note.trim().slice(0, 2000) : null
  // 'partial' (אישור חלקי) — тоже решение офицера: фиксируем кто/когда.
  const decided = status === 'verified' || status === 'rejected' || status === 'partial'
  const u = sb as unknown as SupabaseClient

  try {
    const { error } = await u
      .from('education_journeys')
      .update({
        jewishness_status: status,
        jewishness_verified_by: decided ? changedBy : null,
        jewishness_verified_at: decided ? new Date().toISOString() : null,
        jewishness_notes: note,
      })
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
    await u.from('jewishness_status_history').insert({
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
