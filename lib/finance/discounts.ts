import type { createServerClient } from '@/lib/supabase/server'
import { toCents } from '@/lib/finance/money'

/**
 * Суммирует finance_discounts.amount (в копейках) по journey, для НАБОРА счетов,
 * который передал вызывающий (обычно — АКТИВНЫЕ счета студентов). Ключ карты —
 * journey_id, значение — копейки скидок по его активным счетам.
 *
 * Зачем отдельно: скидка привязана к charge_id, а не к journey_id, и в баланс
 * идёт ТОЛЬКО по активным счетам (см. правило в lib/finance/money.ts и ledger-
 * роут). Список финансов и отчёт раньше баланс СКИДКИ НЕ вычитали — из-за чего
 * студентка со скидкой, обнулившей долг, всё равно висела «должницей». Этот
 * помощник приводит оба экрана к тому же правилу, что и ledger.
 *
 * Устойчивость: постранично (db-max-rows молча режет выдачу) и deploy-safe к
 * отсутствию таблицы (42P01 → пусто, как в ledger-роуте до миграции скидок).
 *
 * @param chargeToJourney карта chargeId → journeyId ТОЛЬКО по учитываемым счетам.
 */
export async function sumDiscountCentsForCharges(
  sb: ReturnType<typeof createServerClient>,
  chargeToJourney: Map<string, string>,
): Promise<Map<string, number>> {
  const acc = new Map<string, number>()
  const chargeIds = [...chargeToJourney.keys()]
  if (chargeIds.length === 0) return acc

  const PAGE = 1000
  try {
    // .in() по chargeIds бьём на пачки (длинный URL), внутри пачки — постранично.
    for (let i = 0; i < chargeIds.length; i += PAGE) {
      const slice = chargeIds.slice(i, i + PAGE)
      let from = 0
      for (;;) {
        const { data, error } = await sb
          .from('finance_discounts')
          .select('charge_id, amount')
          .in('charge_id', slice)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const rows = (data ?? []) as Array<{ charge_id: string; amount: number | string }>
        for (const d of rows) {
          const jid = chargeToJourney.get(d.charge_id)
          if (jid) acc.set(jid, (acc.get(jid) ?? 0) + toCents(d.amount))
        }
        if (rows.length < PAGE) break
        from += PAGE
      }
    }
  } catch (e) {
    // Таблицы скидок ещё нет (до миграции) → считаем, что скидок нет.
    if ((e as { code?: string }).code !== '42P01') throw e
  }
  return acc
}
