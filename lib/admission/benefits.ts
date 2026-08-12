import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Льготы приёма (Stage 2): скидка на שכר לимуд (%) + сумма поддержки (תמיכה) +
 * заметки о льготах — по итогам проверки еврейства. Хранятся на профиле
 * (education_journeys) и копируются в договор (admission_contracts) при приёме.
 *
 * Деплой-безопасно: до применения миграции 20260724130000 колонок/таблицы нет —
 * функции тихо возвращают false (42703 undefined_column / 42P01 undefined_table),
 * не роняя вызывающий поток (best-effort).
 */

type SB = ReturnType<typeof createServerClient>
const MISSING = new Set(['42703', '42P01']) // undefined_column / undefined_table

export interface BenefitsInput {
  discountPercent?: number | null
  supportAmount?: number | null
  benefitsNotes?: string | null
}

/**
 * Нормализует/валидирует сырой ввод льгот (из result_data / тела запроса).
 * Чистая функция (без БД) — легко тестируется.
 *   • discount_percent — число 0..100 (иначе игнорируется);
 *   • support_amount   — число >= 0 (иначе игнорируется);
 *   • benefits_notes   — строка (trim, до 2000 симв.).
 * Возвращает только те поля, что переданы валидно; null — если ничего.
 */
export function parseBenefitsInput(raw: unknown): BenefitsInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: BenefitsInput = {}

  const num = (v: unknown): number | null => {
    if (v === null || v === '') return null
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
  }

  if ('discount_percent' in r) {
    const n = num(r.discount_percent)
    if (n !== null && n >= 0 && n <= 100) out.discountPercent = n
    else if (r.discount_percent === null || r.discount_percent === '') out.discountPercent = null
  }
  if ('support_amount' in r) {
    const n = num(r.support_amount)
    if (n !== null && n >= 0) out.supportAmount = n
    else if (r.support_amount === null || r.support_amount === '') out.supportAmount = null
  }
  if ('benefits_notes' in r) {
    const s = r.benefits_notes
    if (typeof s === 'string') out.benefitsNotes = s.trim() ? s.trim().slice(0, 2000) : null
    else if (s === null) out.benefitsNotes = null
  }

  return Object.keys(out).length ? out : null
}

/**
 * Пишет льготы на профиль (education_journeys). Обновляет только переданные
 * поля. Возвращает true при успехе, false — если фича не мигрирована.
 */
export async function setAdmissionBenefits(
  sb: SB,
  opts: { journeyId: string; benefits: BenefitsInput; setBy: string | null },
): Promise<boolean> {
  const { journeyId, benefits, setBy } = opts
  const patch: Record<string, unknown> = {
    benefits_set_by: setBy,
    benefits_set_at: new Date().toISOString(),
  }
  if ('discountPercent' in benefits) patch.tuition_discount_percent = benefits.discountPercent
  if ('supportAmount' in benefits) patch.support_amount = benefits.supportAmount
  if ('benefitsNotes' in benefits) patch.benefits_notes = benefits.benefitsNotes

  const u = sb as unknown as SupabaseClient
  try {
    const { error } = await u.from('education_journeys').update(patch).eq('id', journeyId)
    if (error) {
      if (MISSING.has((error as { code?: string }).code ?? '')) return false
      throw error
    }
    return true
  } catch (e) {
    if (MISSING.has((e as { code?: string }).code ?? '')) return false
    throw e
  }
}

/**
 * Создаёт действующий договор (admission_contracts) при приёме, копируя льготы
 * из профиля. Идемпотентно: если действующий договор уже есть — пропускает.
 * Best-effort / деплой-безопасно. Возвращает 'created' | 'exists' | 'skipped'
 * ('skipped' — фича не мигрирована).
 */
export async function createAdmissionContract(
  sb: SB,
  opts: { journeyId: string; createdBy: string | null },
): Promise<'created' | 'exists' | 'skipped'> {
  const { journeyId, createdBy } = opts
  const u = sb as unknown as SupabaseClient

  try {
    // Уже есть действующий договор? (uq по journey_id WHERE status='active')
    const { data: existing, error: exErr } = await u
      .from('admission_contracts')
      .select('id')
      .eq('journey_id', journeyId)
      .eq('status', 'active')
      .maybeSingle()
    if (exErr) {
      if (MISSING.has((exErr as { code?: string }).code ?? '')) return 'skipped'
      throw exErr
    }
    if (existing) return 'exists'

    // Копируем льготы из профиля (select '*' — деплой-безопасно).
    const { data: journey, error: jErr } = await u
      .from('education_journeys')
      .select('*')
      .eq('id', journeyId)
      .maybeSingle()
    if (jErr) {
      if (MISSING.has((jErr as { code?: string }).code ?? '')) return 'skipped'
      throw jErr
    }
    const j = (journey ?? {}) as Record<string, unknown>

    const { error: insErr } = await u.from('admission_contracts').insert({
      journey_id: journeyId,
      tuition_discount_percent: (j.tuition_discount_percent as number | null) ?? null,
      support_amount: (j.support_amount as number | null) ?? null,
      benefits_notes: (j.benefits_notes as string | null) ?? null,
      status: 'active',
      created_by: createdBy,
    })
    if (insErr) {
      if (MISSING.has((insErr as { code?: string }).code ?? '')) return 'skipped'
      // Гонка: параллельно создан действующий договор → uq_violation (23505).
      if ((insErr as { code?: string }).code === '23505') return 'exists'
      throw insErr
    }
    return 'created'
  } catch (e) {
    if (MISSING.has((e as { code?: string }).code ?? '')) return 'skipped'
    if ((e as { code?: string }).code === '23505') return 'exists'
    throw e
  }
}
