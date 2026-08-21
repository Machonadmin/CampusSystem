import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

// ── Автоматический переход учебного года ─────────────────────────────────────
// Идемпотентно: за один календарный год выполняется один раз (last_rolled_year).
// Все обращения к новым таблицам/колонкам деплой-безопасны: если миграция ещё
// не применена (42P01/42703) — движок молча становится no-op, а не роняет 500.

// ЗАМОРОЖЕНО по просьбе владельца (пока не используем переход года). Ни авто-, ни
// ручной запуск НЕ выполняет продвижение/выпуск. Чтобы разморозить — снять флаг.
const ROLLOVER_FROZEN = true

function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

export interface RolloverSettings {
  rollover_month: number
  rollover_day: number
  auto_enabled: boolean
  last_rolled_year: number | null
}

export interface RolloverResult {
  ran: boolean
  promoted: number
  graduated: number
  reason?: 'no_settings' | 'auto_disabled' | 'not_eligible' | 'already_done' | 'frozen'
}

export async function getRolloverSettings(
  sb: ReturnType<typeof createServerClient>,
): Promise<RolloverSettings | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (u(sb)
    .from('academic_year_settings')
    .select('rollover_month, rollover_day, auto_enabled, last_rolled_year')
    .eq('id', true)
    .maybeSingle() as any)
  if (error || !data) return null
  return data as RolloverSettings
}

/** Дата перехода уже наступила в этом календарном году, и он ещё не выполнялся. */
function isEligible(s: RolloverSettings, now: Date): boolean {
  const year = now.getFullYear()
  const rollDate = new Date(year, s.rollover_month - 1, s.rollover_day)
  if (now < rollDate) return false
  if ((s.last_rolled_year ?? 0) >= year) return false
  return true
}

/**
 * Выполняет переход года. По умолчанию — авто-режим (нужны auto_enabled +
 * наступившая дата + не выполнено в этом году). manual=true запускает вручную,
 * но всё равно не даёт выполнить дважды за календарный год.
 */
export async function runYearRollover(
  sb: ReturnType<typeof createServerClient>,
  opts: { manual?: boolean } = {},
): Promise<RolloverResult> {
  // Заморожено: единая точка отсечения — ни авто, ни ручной запуск не двигают год.
  if (ROLLOVER_FROZEN) return { ran: false, promoted: 0, graduated: 0, reason: 'frozen' }

  const settings = await getRolloverSettings(sb)
  if (!settings) return { ran: false, promoted: 0, graduated: 0, reason: 'no_settings' }

  const now = new Date()
  const year = now.getFullYear()

  if (opts.manual) {
    if ((settings.last_rolled_year ?? 0) >= year) {
      return { ran: false, promoted: 0, graduated: 0, reason: 'already_done' }
    }
  } else {
    if (!settings.auto_enabled) return { ran: false, promoted: 0, graduated: 0, reason: 'auto_disabled' }
    if (!isEligible(settings, now)) return { ran: false, promoted: 0, graduated: 0, reason: 'not_eligible' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (u(sb).rpc('advance_academic_year') as any)
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  const promoted = Number(row?.promoted ?? 0)
  const graduated = Number(row?.graduated ?? 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (u(sb)
    .from('academic_year_settings')
    .update({ last_rolled_year: year, updated_at: now.toISOString() })
    .eq('id', true) as any)

  return { ran: true, promoted, graduated }
}
