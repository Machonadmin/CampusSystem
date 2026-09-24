// ─── Спонсоры: агрегаты пожертвований и поиск доноров — чистая логика ─────────
//
// Никаких обращений к БД — логика детерминирована и целиком покрывается
// юнит-тестами (donations.test.ts, vitest). Денежные суммы считаются в целых
// КОПЕЙКАХ через lib/finance/money.ts (toCents/sumCents/centsToNumber), чтобы
// избежать дрейфа float (0.1 + 0.2 ≠ 0.3); на выходе — числа-валюта с двумя
// знаками. amount может прийти строкой от PostgREST — money-хелперы это учитывают.

import { toCents, sumCents, centsToNumber } from '@/lib/finance/money'

/** Минимальная форма пожертвования для агрегатов по статусу. */
export interface DonationStatLike {
  amount: number | string
  status: string
}

/** Минимальная форма пожертвования для агрегатов по кампании. */
export interface DonationCampaignLike {
  amount: number | string
  status: string
  campaign: string | null
}

/** Минимальная форма донора для app-side поиска. */
export interface SponsorSearchable {
  name: string
  email: string | null
  phone: string | null
  contact_person: string | null
}

export interface DonationStats {
  /** Σ сумм со статусом 'received', валюта (2 знака). */
  total_received: number
  /** Σ сумм со статусом 'pledged', валюта (2 знака). */
  total_pledged: number
  /** Σ сумм со статусом 'cancelled', валюта (2 знака). */
  total_cancelled: number
  /** Кол-во пожертвований по каждому встретившемуся статусу. */
  count_by_status: Record<string, number>
}

/**
 * Сводка по пожертвованиям: суммы received / pledged / cancelled (валюта, 2
 * знака; сумма в копейках через money.ts — без float-дрейфа) и счётчик по
 * каждому статусу. Пустой вход → нули и пустой count_by_status. Устойчиво к
 * amount-строкам от PostgREST.
 */
export function donationStats(donations: DonationStatLike[]): DonationStats {
  const count_by_status: Record<string, number> = {}
  for (const d of donations) {
    count_by_status[d.status] = (count_by_status[d.status] ?? 0) + 1
  }
  return {
    total_received: centsToNumber(sumCents(donations.filter(d => d.status === 'received'))),
    total_pledged: centsToNumber(sumCents(donations.filter(d => d.status === 'pledged'))),
    total_cancelled: centsToNumber(sumCents(donations.filter(d => d.status === 'cancelled'))),
    count_by_status,
  }
}

/**
 * Суммы по кампаниям для заданного статуса (по умолчанию 'received'): валюта (2
 * знака), сумма в копейках через money.ts. Пожертвования без кампании (null или
 * пустая после trim) и с другим статусом пропускаются. Пустой вход → {}.
 */
export function campaignTotals(
  donations: DonationCampaignLike[],
  statusFilter = 'received',
): Record<string, number> {
  const cents: Record<string, number> = {}
  for (const d of donations) {
    if (d.status !== statusFilter) continue
    const campaign = d.campaign?.trim()
    if (!campaign) continue
    cents[campaign] = (cents[campaign] ?? 0) + toCents(d.amount)
  }
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(cents)) out[k] = centsToNumber(v)
  return out
}

/**
 * Case-insensitive поиск подстроки по имени, email, телефону и контактному лицу
 * донора. Пустой (или пробельный) запрос совпадает со всеми. null-поля не
 * ломают поиск и не совпадают.
 */
export function matchesSponsorSearch(s: SponsorSearchable, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [s.name, s.email ?? '', s.phone ?? '', s.contact_person ?? '']
    .some(f => f.toLowerCase().includes(needle))
}
