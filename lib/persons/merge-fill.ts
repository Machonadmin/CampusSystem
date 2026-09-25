import type { createServerClient } from '@/lib/supabase/server'
import { phoneMatchKeys } from '@/lib/persons/duplicate-match'
import { phoneList } from '@/lib/persons/phone'

/**
 * Дозаполнение существующей карточки персоны данными повторной заявки
 * (решение владельца 24.09.2026): заполняем ТОЛЬКО пустые поля, никогда не
 * перезаписываем уже заполненное. Телефоны — дописываем новые номера (которых
 * ещё нет по ключу последних 9 цифр), сохраняя формат существующего массива.
 * full_name — GENERATED, не пишем никогда.
 */

type Sb = ReturnType<typeof createServerClient>

/** Простые текстовые/датовые колонки, которые можно дозаполнить. */
export const FILLABLE_SCALAR_FIELDS = [
  'first_name', 'last_name', 'middle_name', 'hebrew_name', 'email', 'gender',
  'birth_date', 'marital_status', 'nationality', 'passport_number',
] as const

export type FillableScalar = typeof FILLABLE_SCALAR_FIELDS[number]

export type IncomingPersonFields = Partial<Record<FillableScalar, string | null>> & {
  address?: Record<string, unknown> | null
  phones?: string[]
}

export interface ExistingPerson {
  phones: unknown
  address: unknown
  [key: string]: unknown
}

function isBlank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/** Адрес пуст: null, не объект или объект без единого непустого значения. */
export function isEmptyAddress(v: unknown): boolean {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return true
  return !Object.values(v as Record<string, unknown>).some(x => !isBlank(x))
}

/**
 * Чистая часть: что именно дописать. Возвращает patch для UPDATE persons и
 * список имён заполненных полей ('phones' — если добавлен хотя бы один номер).
 */
export function computeFill(existing: ExistingPerson, incoming: IncomingPersonFields): {
  patch: Record<string, unknown>
  filled: string[]
} {
  const patch: Record<string, unknown> = {}
  const filled: string[] = []

  for (const f of FILLABLE_SCALAR_FIELDS) {
    const val = incoming[f]
    if (isBlank(val)) continue
    if (!isBlank(existing[f])) continue
    patch[f] = (val as string).trim()
    filled.push(f)
  }

  if (incoming.address && !isEmptyAddress(incoming.address) && isEmptyAddress(existing.address)) {
    patch.address = incoming.address
    filled.push('address')
  }

  // Телефоны: дописываем только новые номера. Формат — как у существующего
  // массива: если там объекты {type, number} — добавляем объектом, иначе строкой.
  const current = Array.isArray(existing.phones) ? existing.phones as unknown[] : []
  const knownKeys = new Set(phoneMatchKeys(current))
  const knownRaw = new Set(phoneList(current).map(p => p.replace(/\s+/g, '')))
  const asObjects = current.some(p => p != null && typeof p === 'object')
  const additions: unknown[] = []
  for (const raw of incoming.phones ?? []) {
    const num = raw?.trim()
    if (!num) continue
    const key = phoneMatchKeys([num])[0]
    // Короткие номера (без ключа) сравниваем по самой строке без пробелов.
    const dup = key ? knownKeys.has(key) : knownRaw.has(num.replace(/\s+/g, ''))
    if (dup) continue
    if (key) knownKeys.add(key)
    knownRaw.add(num.replace(/\s+/g, ''))
    additions.push(asObjects ? { type: 'mobile', number: num } : num)
  }
  if (additions.length > 0) {
    patch.phones = [...current, ...additions]
    filled.push('phones')
  }

  return { patch, filled }
}

/**
 * Дозаполняет пустые поля персоны. Возвращает имена заполненных полей
 * (пустой массив — ничего не изменилось).
 */
export async function fillEmptyPersonFields(sb: Sb, personId: string, incoming: IncomingPersonFields): Promise<string[]> {
  const { data, error } = await sb
    .from('persons')
    .select('first_name, last_name, middle_name, hebrew_name, email, gender, birth_date, address, marital_status, nationality, passport_number, phones')
    .eq('id', personId)
    .maybeSingle()
  if (error) throw error
  if (!data) return []
  const { patch, filled } = computeFill(data as unknown as ExistingPerson, incoming)
  if (filled.length === 0) return []
  const { error: updErr } = await sb
    .from('persons')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', personId)
  if (updErr) throw updErr
  return filled
}
