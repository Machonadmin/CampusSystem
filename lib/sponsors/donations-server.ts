import { createServerClient } from '@/lib/supabase/server'
import { toCents, centsToNumber } from '@/lib/finance/money'
import { donationStats, type DonationStats } from './donations'

// ─── Пакетные выборки пожертвований для списка доноров (без N+1) ──────────────
//
// Читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который по умолчанию
// отдаёт не более ~1000 строк за запрос и МОЛЧА обрезает остальное). Запрос
// возвращает строку НА КАЖДОЕ пожертвование (не на донора), поэтому при
// масштабе единый .select() без пагинации обрезался бы и давал неверные суммы.
// Тот же приём, что lib/documents/records-server.ts и lib/finance/students.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

export interface SponsorDonationAggregates {
  /** sponsor_id → Σ сумм 'received', в целых КОПЕЙКАХ. */
  receivedCentsBySponsor: Map<string, number>
  /** Глобальная сводка по ВСЕМ пожертвованиям (received/pledged/cancelled). */
  stats: DonationStats
}

/**
 * Один постраничный проход по всем пожертвованиям: считает сумму 'received' по
 * каждому донору (в копейках) и общую сводку donationStats. Всё за одну
 * выборку — без N+1 по донорам.
 */
export async function loadDonationAggregates(sb: SB): Promise<SponsorDonationAggregates> {
  const all: { sponsor_id: string; amount: number | string; status: string }[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('donations')
      .select('sponsor_id, amount, status')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { sponsor_id: string; amount: number | string; status: string }[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }

  const receivedCentsBySponsor = new Map<string, number>()
  for (const r of all) {
    if (r.status !== 'received') continue
    receivedCentsBySponsor.set(
      r.sponsor_id,
      (receivedCentsBySponsor.get(r.sponsor_id) ?? 0) + toCents(r.amount),
    )
  }

  return { receivedCentsBySponsor, stats: donationStats(all) }
}

/** Копейки одного донора → валюта (2 знака). Хелпер для сборки ответа списка. */
export function receivedForSponsor(
  aggregates: SponsorDonationAggregates, sponsorId: string,
): number {
  return centsToNumber(aggregates.receivedCentsBySponsor.get(sponsorId) ?? 0)
}
