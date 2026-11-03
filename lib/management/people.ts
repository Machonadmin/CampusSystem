import type { AnySB } from './store'

export interface PersonLite { id: string; name: string }

/** Имена людей по id (ивритское имя, иначе полное). Пустой список → пустая карта. */
export async function personNames(sb: AnySB, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  const out = new Map<string, string>()
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', uniq.slice(i, i + 200))
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
      out.set(p.id, p.hebrew_name || p.full_name || '—')
    }
  }
  return out
}
