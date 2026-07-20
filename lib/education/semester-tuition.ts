import type { SupabaseClient } from '@supabase/supabase-js'
import type { createServerClient } from '@/lib/supabase/server'

/**
 * Школьная плата за семестр-группу (фаза 3).
 *
 * Правило владельца: «студентка, привязанная к семестру, ОБЯЗАНА оплатить».
 * → при зачислении в семестр-группу с заданной tuition_amount порождаем ОДИН
 *   счёт finance_charges (category 'tuition', class_group_id), идемпотентно
 *   (через class_enrollments.tuition_charge_id).
 * Возврат/кредит при отчислении НЕ реализуем — это решение финансового отдела
 * (по указанию владельца). Отчисление денег не трогает.
 *
 * Деплой-безопасно: если финансовые таблицы/колонки не мигрированы
 * (42P01/42703) — счёт не создаём, возвращаем warning, а не падаем.
 */

type ServerClient = ReturnType<typeof createServerClient>
function u(sb: ServerClient): SupabaseClient {
  return sb as unknown as SupabaseClient
}

const SOFT = new Set(['42P01', '42703'])
function code(e: unknown): string {
  return (e as { code?: string })?.code ?? ''
}

export interface SemesterTuitionGroup {
  id: string
  tuition_amount: number | null
  name?: string | null
  year_label?: string | null
  term_number?: number | null
}

/**
 * Гарантирует счёт tuition для каждой из journeyIds, зачисленных в group.
 * Считаем, что journeyIds уже зачислены (есть строка class_enrollments) и это
 * студентки. Ничего не делаем, если у группы нет положительной tuition_amount.
 */
export async function ensureSemesterTuitionCharges(
  sb: ServerClient,
  group: SemesterTuitionGroup,
  journeyIds: string[],
  createdBy: string | null,
): Promise<{ created: number; warning?: string }> {
  const amount = Number(group.tuition_amount)
  if (!journeyIds.length || !group.tuition_amount || !(amount > 0)) return { created: 0 }

  const label = group.name?.trim()
    || [group.year_label, group.term_number].filter(v => v != null && `${v}`.trim() !== '').join(' · ')
    || 'סמסטר'

  // Уже начисленные (tuition_charge_id заполнен) — пропускаем. Если колонки нет
  // (42703) — считаем, что связей нет, но и хранить связь не сможем (warn ниже).
  const already = new Set<string>()
  let linkColumnMissing = false
  {
    const { data, error } = await u(sb)
      .from('class_enrollments')
      .select('journey_id, tuition_charge_id')
      .eq('class_group_id', group.id)
      .in('journey_id', journeyIds)
    if (error) {
      if (!SOFT.has(code(error))) throw error
      linkColumnMissing = true
    } else {
      for (const r of (data ?? []) as Array<{ journey_id: string; tuition_charge_id: string | null }>) {
        if (r.tuition_charge_id) already.add(r.journey_id)
      }
    }
  }

  const todo = journeyIds.filter(id => !already.has(id))
  if (!todo.length) return { created: 0 }

  let created = 0
  let warning: string | undefined
  for (const journeyId of todo) {
    const { data: charge, error: cErr } = await u(sb)
      .from('finance_charges')
      .insert({
        journey_id: journeyId,
        amount,
        description: label,
        period_label: label,
        category: 'tuition',
        class_group_id: group.id,
        created_by: createdBy,
      })
      .select('id')
      .single()
    if (cErr) {
      // Финансы не мигрированы (нет таблицы/колонки class_group_id) — деградируем.
      if (SOFT.has(code(cErr))) {
        return { created, warning: 'שכר הלימוד לא נפתח כחוב: מודול הכספים עדיין לא מוגדר בבסיס הנתונים.' }
      }
      if (code(cErr) === '23503') { warning = 'חלק מהחיובים לא נוצרו (הפניה לא תקינה).'; continue }
      throw cErr
    }
    created++

    if (!linkColumnMissing) {
      const chargeId = (charge as { id: string }).id
      const { error: linkErr } = await u(sb)
        .from('class_enrollments')
        .update({ tuition_charge_id: chargeId })
        .eq('class_group_id', group.id)
        .eq('journey_id', journeyId)
      if (linkErr) {
        if (SOFT.has(code(linkErr))) linkColumnMissing = true
        else throw linkErr
      }
    }
  }

  if (linkColumnMissing) {
    warning = (warning ? warning + ' ' : '')
      + 'החיובים נוצרו אך הקישור לרישום לא נשמר (העמודה tuition_charge_id חסרה).'
  }
  return { created, warning }
}
