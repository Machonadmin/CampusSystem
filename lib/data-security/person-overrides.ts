// ─── Сохранение личных решений без потери их истории ─────────────────────────
//
// Экран «по сотруднику» присылает ПОЛНЫЙ список личных решений по человеку
// (контракт PUT /api/data-security/person/[personId] не меняется). Раньше
// маршрут стирал все строки person_privileges и вставлял их заново — и вместе с
// ними пропадали срок (expires_at), причина (reason) и то, кто выдал
// (granted_by): временная выдача становилась бессрочной, а «выдал» переписывался
// на того, кто нажал «сохранить» по совсем другой строке.
//
// Здесь — чистый расчёт разницы между тем, что лежит в базе, и тем, что прислал
// экран. Строки, которые не менялись, не трогаются вовсе.

export interface ExistingOverride {
  id: string
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at: string | null
  reason: string | null
}

export interface WantedOverride {
  module: string
  privilege_code: string
  is_granted: boolean
  /** undefined — «не менять» у существующей строки; null — снять срок. */
  expires_at?: string | null
  /** undefined — «не менять» у существующей строки. */
  reason?: string | null
}

export interface OverrideInsert {
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at: string | null
  reason: string | null
}

export interface OverrideUpdate {
  id: string
  patch: { is_granted?: boolean; expires_at?: string | null; reason?: string | null }
  /**
   * Решение выдано заново (сменилось «открыто/закрыто» или срок) — маршрут
   * тогда записывает нового выдавшего и время. Правка одной причины выдавшего
   * не меняет.
   */
  regranted: boolean
}

export interface OverridePlan {
  insert: OverrideInsert[]
  update: OverrideUpdate[]
  /** id строк, которых в присланном списке больше нет. */
  remove: string[]
}

const keyOf = (module: string, code: string) => `${module}::${code}`

const normReason = (r: string | null | undefined): string | null => r?.trim() || null

/** Одинаковые ли моменты времени: база и браузер пишут их в разных форматах. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b
  return ta === tb
}

export function planOverrideChanges(
  existing: readonly ExistingOverride[],
  wanted: readonly WantedOverride[],
): OverridePlan {
  // Повтор одного права в запросе: побеждает последнее решение.
  const wantedByKey = new Map<string, WantedOverride>()
  for (const w of wanted) wantedByKey.set(keyOf(w.module, w.privilege_code), w)

  const existingByKey = new Map<string, ExistingOverride>()
  for (const e of existing) existingByKey.set(keyOf(e.module, e.privilege_code), e)

  const plan: OverridePlan = { insert: [], update: [], remove: [] }

  for (const e of existing) {
    if (!wantedByKey.has(keyOf(e.module, e.privilege_code))) plan.remove.push(e.id)
  }

  for (const [key, w] of wantedByKey) {
    const isGranted = !!w.is_granted
    const e = existingByKey.get(key)

    if (!e) {
      plan.insert.push({
        module: w.module,
        privilege_code: w.privilege_code,
        is_granted: isGranted,
        expires_at: w.expires_at ?? null,
        reason: normReason(w.reason),
      })
      continue
    }

    if (e.is_granted !== isGranted) {
      // Решение перевернулось — это новое решение. Срок и причина прежнего
      // («открыто до конца месяца, потому что…») к запрету не относятся.
      plan.update.push({
        id: e.id,
        patch: {
          is_granted: isGranted,
          expires_at: w.expires_at ?? null,
          reason: normReason(w.reason),
        },
        regranted: true,
      })
      continue
    }

    const patch: OverrideUpdate['patch'] = {}
    let regranted = false
    if (w.expires_at !== undefined && !sameInstant(e.expires_at, w.expires_at)) {
      patch.expires_at = w.expires_at
      regranted = true
    }
    if (w.reason !== undefined && normReason(w.reason) !== normReason(e.reason)) {
      patch.reason = normReason(w.reason)
    }
    if (Object.keys(patch).length > 0) plan.update.push({ id: e.id, patch, regranted })
  }

  return plan
}
