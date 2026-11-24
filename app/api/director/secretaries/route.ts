import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { delegateIdsOf, personNames } from '@/lib/meetings/access'
import { clearFinancePermissionsCache } from '@/lib/finance/permissions'
import { clearPermissionsCache as clearEducationPermissionsCache } from '@/lib/education/permissions'
import { clearDataSecurityPermissionsCache } from '@/lib/data-security/permissions'
import {
  SECRETARY_GRANTS, SECRETARY_GRANT_CATEGORIES, isActiveGrant, isSecretaryGrantCategory,
  type SecretaryGrantCategory,
} from '@/lib/director/rules'
import type { PrivilegeModule } from '@/types/database'

/**
 * «מרחב המנהל», шаг 3: המנהל открывает своему секретарю утверждение по категориям.
 *
 * GET  — секретари המנהל (кто ведёт его календарь) и какие категории им открыты.
 * PUT  { person_id, category, enabled } — выдать / снять УЗКОЕ право категории
 *      (lib/director/rules.ts → SECRETARY_GRANTS) личной строкой person_privileges —
 *      той же, что пишет экран «אבטחת מידע»: там её видно и там же можно снять.
 *
 * Право: ТОЛЬКО המנהל (superadmin) и ТОЛЬКО для тех, кто ведёт ЕГО календарь.
 */

const REASON = 'מרחב המנהל: המנהל פתח למזכירה אישור בקטגוריה הזו'

type SB = ReturnType<typeof createServerClient>
interface Row { id: string; module: string; privilege_code: string; is_granted: boolean; expires_at: string | null }

async function grantRows(sb: SB, personIds: string[]): Promise<Array<Row & { person_id: string }>> {
  if (personIds.length === 0) return []
  const codes = [...new Set(SECRETARY_GRANT_CATEGORIES.map(c => SECRETARY_GRANTS[c].privilege_code))]
  const { data, error } = await sb.from('person_privileges')
    .select('id, person_id, module, privilege_code, is_granted, expires_at')
    .in('person_id', personIds)
    .in('privilege_code', codes)
  if (error) throw error
  return (data ?? []) as unknown as Array<Row & { person_id: string }>
}

function findRow(rows: Array<Row & { person_id: string }>, personId: string, cat: SecretaryGrantCategory) {
  const g = SECRETARY_GRANTS[cat]
  return rows.find(r => r.person_id === personId && r.module === g.module && r.privilege_code === g.privilege_code)
}

export async function GET() {
  try {
    const session = await requireAuth()
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)
    const sb = createServerClient()
    const ids = await delegateIdsOf(sb, session.person_id)
    const [names, rows] = await Promise.all([personNames(sb, ids), grantRows(sb, ids)])
    const now = new Date().toISOString()
    const secretaries = ids.map(id => ({
      id,
      name: names.get(id) ?? '',
      granted: SECRETARY_GRANT_CATEGORIES.filter(c => {
        const r = findRow(rows, id, c)
        return !!r && isActiveGrant(r, now)
      }),
    })).sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ categories: SECRETARY_GRANT_CATEGORIES, secretaries })
  } catch (err) {
    return jsonError(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)
    const body = await request.json().catch(() => ({})) as { person_id?: unknown; category?: unknown; enabled?: unknown }
    const personId = typeof body.person_id === 'string' ? body.person_id : ''
    if (!personId || !isSecretaryGrantCategory(body.category) || typeof body.enabled !== 'boolean') {
      return apiError('invalid_reference', 400)
    }
    const category = body.category
    const enabled = body.enabled

    // Автор изменения уходит в журнал изменений (как на «אבטחת מידע»).
    const sb = createServerClient({ actorPersonId: session.person_id })
    if (!(await delegateIdsOf(sb, session.person_id)).includes(personId)) return apiError('forbidden', 403)

    const g = SECRETARY_GRANTS[category]
    // Пока миграция 20261124120000 не применена, нового права нет в каталоге —
    // строка выглядела бы выданной на «אבטחת מידע», но ничего бы не значила.
    const { data: known } = await sb.from('module_privileges').select('privilege_code')
      .eq('module', g.module as PrivilegeModule).eq('privilege_code', g.privilege_code).maybeSingle()
    if (!known) return apiError('feature_unavailable', 503)

    const { data: existing, error: readErr } = await sb.from('person_privileges')
      .select('id, module, privilege_code, is_granted, expires_at')
      .eq('person_id', personId).eq('module', g.module as PrivilegeModule).eq('privilege_code', g.privilege_code)
      .maybeSingle()
    if (readErr) throw readErr
    const row = existing as Row | null
    const nowIso = new Date().toISOString()

    if (enabled) {
      if (row) {
        if (!isActiveGrant(row, nowIso)) {
          const { error } = await sb.from('person_privileges')
            .update({ is_granted: true, expires_at: null, reason: REASON, granted_by: session.person_id, granted_at: nowIso })
            .eq('id', row.id)
          if (error) throw error
        }
      } else {
        const { error } = await sb.from('person_privileges').insert({
          person_id: personId, module: g.module as PrivilegeModule, privilege_code: g.privilege_code,
          is_granted: true, reason: REASON, expires_at: null, granted_by: session.person_id,
        })
        if (error) throw error
      }
    } else if (row && row.is_granted) {
      // Снимаем только выдачу. Личный ЗАПРЕТ (is_granted=false), поставленный на
      // «אבטחת מידע», переключатель не трогает.
      const { error } = await sb.from('person_privileges').delete().eq('id', row.id)
      if (error) throw error
    }

    // Права кэшируются на 30 секунд — сбрасываем, чтобы изменение действовало сразу.
    clearFinancePermissionsCache(personId)
    clearEducationPermissionsCache(personId)
    clearDataSecurityPermissionsCache(personId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return jsonError(err)
  }
}
