import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { hasDataSecurityPrivilege } from '@/lib/data-security/permissions'
import {
  getHeadScope, getLimitedGrantContext, saveHeadOverrides, type SubmittedOverride,
} from '@/lib/data-security/head-scope'
import { createServerClient } from '@/lib/supabase/server'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { loadPersonAccess } from '@/lib/data-security/load'
import { clearDataSecurityPermissionsCache } from '@/lib/data-security/permissions'
import type { PrivilegeModule } from '@/types/database'
import { planOverrideChanges, type ExistingOverride } from '@/lib/data-security/person-overrides'
import { errorResponse } from '@/lib/api/handler'

/**
 * Права конкретного сотрудника.
 *
 *   GET — что у него открыто на самом деле, с источником каждого права
 *         (от должности / открыто лично / закрыто лично / временно).
 *   PUT — сохранить ЛИЧНЫЕ решения по нему.
 *
 * PUT пишет только person_privileges — личные оверрайды. Права должности
 * (role_privileges) отсюда не меняются намеренно: правка роли задела бы всех её
 * держателей разом, а этот экран — про одного человека.
 */

export async function GET(_request: NextRequest, props: { params: Promise<{ personId: string }> }) {
  const params = await props.params
  try {
    // Полный доступ — как раньше. Иначе глава отдела видит только свою команду
    // (lib/data-security/head-scope.ts); всем остальным — прежняя проверка
    // 'access', она и отвечает 401/403.
    const session = await getSession()
    const headSees = session && !(await hasDataSecurityPrivilege(session, 'access'))
      ? (await getHeadScope(session))?.personIds.has(params.personId) === true
      : false
    if (!headSees) await requireDataSecurityPrivilege('access')
    const access = await loadPersonAccess(params.personId, getCookieLocale())
    if (!access) return apiError('person_not_found', 404)
    return NextResponse.json(access)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

interface Override {
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at?: string | null
  reason?: string | null
}

export async function PUT(request: NextRequest, props: { params: Promise<{ personId: string }> }) {
  const params = await props.params
  // Глава отдела без права 'grant' — свой, ограниченный путь (putAsHead ниже).
  const headCtx = await getLimitedGrantContext().catch(() => null)
  if (headCtx) return putAsHead(request, params.personId, headCtx)

  try {
    const session = await requireDataSecurityPrivilege('grant')
    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })
    const personId = params.personId
    if (!personId) return apiError('invalid_reference', 400)

    const { overrides } = await request.json() as { overrides?: Override[] }
    if (!Array.isArray(overrides)) return apiError('invalid_reference', 400)

    const rows = overrides.filter(o => o.module && o.privilege_code)

    // Каталог — источник правды о том, что вообще существует. Строка с кодом,
    // которого в каталоге нет, не даст ничего (её никто не проверяет), но будет
    // выглядеть на экране выданным правом. Поэтому такие отбрасываются.
    const { data: catalog } = await sb.from('module_privileges').select('module, privilege_code')
    const known = new Set((catalog ?? []).map(c => `${c.module}::${c.privilege_code}`))
    const unknown = rows.filter(r => !known.has(`${r.module}::${r.privilege_code}`))
    if (unknown.length > 0) return apiError('invalid_reference', 400)

    // Экран присылает полный список личных решений по человеку; пустой список
    // снимает все. Но строки НЕ пересоздаются целиком: иначе вместе с ними
    // пропадали бы срок, причина и «кто выдал» (см. lib/data-security/
    // person-overrides.ts). Вставляются новые, удаляются снятые, обновляются
    // только изменившиеся — остальные остаются как есть.
    const { data: existing, error: readErr } = await sb
      .from('person_privileges')
      .select('id, module, privilege_code, is_granted, expires_at, reason')
      .eq('person_id', personId)
    if (readErr) throw readErr

    const plan = planOverrideChanges((existing ?? []) as ExistingOverride[], rows)
    const nowIso = new Date().toISOString()

    if (plan.remove.length > 0) {
      const { error } = await sb.from('person_privileges').delete().in('id', plan.remove)
      if (error) throw error
    }

    for (const u of plan.update) {
      const { error } = await sb
        .from('person_privileges')
        .update(u.regranted
          ? { ...u.patch, granted_by: session.person_id, granted_at: nowIso }
          : u.patch)
        .eq('id', u.id)
      if (error) throw error
    }

    if (plan.insert.length > 0) {
      const { error } = await sb.from('person_privileges').insert(
        plan.insert.map(r => ({
          person_id: personId,
          module: r.module as PrivilegeModule,
          privilege_code: r.privilege_code,
          is_granted: r.is_granted,
          reason: r.reason,
          expires_at: r.expires_at,
          granted_by: session.person_id,
        })),
      )
      if (error) throw error
    }

    // Права модуля кэшируются на 30 секунд в module-factory. Без сброса
    // администратор увидел бы старую картину сразу после сохранения и решил,
    // что сохранение не сработало.
    clearDataSecurityPermissionsCache(personId)

    const access = await loadPersonAccess(personId, getCookieLocale())
    return NextResponse.json(access)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

/**
 * Сохранение главой отдела: только своя команда и только то, что есть у него
 * самого. Строки вне этого набора остаются в БД как были — см. mergeHeadOverrides.
 */
async function putAsHead(
  request: NextRequest,
  personId: string,
  ctx: NonNullable<Awaited<ReturnType<typeof getLimitedGrantContext>>>,
) {
  try {
    if (!personId) return apiError('invalid_reference', 400)
    if (!ctx.scope.personIds.has(personId)) return apiError('forbidden', 403)

    const { overrides } = await request.json() as { overrides?: SubmittedOverride[] }
    if (!Array.isArray(overrides)) return apiError('invalid_reference', 400)

    const result = await saveHeadOverrides(ctx, personId, overrides.filter(o => o.module && o.privilege_code))
    if (result === 'forbidden') return apiError('forbidden', 403)
    if (result === 'invalid') return apiError('invalid_reference', 400)

    const access = await loadPersonAccess(personId, getCookieLocale())
    return NextResponse.json(access)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
