import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireSecurityPrivilege } from '@/lib/security/permissions'
import { mapDbError } from '@/lib/security/http'
import { isSeverity, isStatus } from '@/lib/security/validation'
import { canTransition } from '@/lib/security/incidents'
import { buildingNamesByIds } from '@/lib/security/locations-server'
import type { SecurityIncidentUpdate } from '@/types/database'

/**
 * GET   /api/security/incidents/[id] — инцидент + имя здания. Право: security.view.
 * PATCH /api/security/incidents/[id] — смена статуса (валидируется через
 *   canTransition → 409 на недопустимом переходе), назначение assigned_to,
 *   серьёзность, resolution. При status='resolved' проставляется resolved_at=now();
 *   сохраняется при resolved→closed, очищается ТОЛЬКО при повторном открытии
 *   resolved→investigating. Право: security.manage.
 */

const COLS =
  'id, occurred_at, building_id, location_text, category, severity, title, description, status, reported_by, assigned_to, resolution, resolved_at, created_by, created_at, updated_at'

interface IncidentRow {
  id: string
  occurred_at: string
  building_id: string | null
  location_text: string | null
  category: string
  severity: string
  title: string
  description: string | null
  status: string
  reported_by: string | null
  assigned_to: string | null
  resolution: string | null
  resolved_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type SB = ReturnType<typeof createServerClient>

/** Дополняет строку инцидента именем здания. */
async function withMeta(sb: SB, row: IncidentRow) {
  const buildingMap = await buildingNamesByIds(sb, row.building_id ? [row.building_id] : [])
  return {
    ...row,
    building_name: row.building_id ? buildingMap.get(row.building_id) ?? null : null,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSecurityPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('security_incidents').select(COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Инцидент не найден' }, { status: 404 })

    return NextResponse.json(await withMeta(sb, data as unknown as IncidentRow))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSecurityPrivilege('manage')

    const body = await request.json() as {
      status?: string
      assigned_to?: string | null
      severity?: string
      resolution?: string | null
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('security_incidents')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Инцидент не найден' }, { status: 404 })

    const update: SecurityIncidentUpdate = {}

    if (body.status !== undefined) {
      if (!isStatus(body.status)) {
        return NextResponse.json({ error: 'Неверный статус' }, { status: 400 })
      }
      if (!canTransition(existing.status, body.status)) {
        return NextResponse.json(
          { error: `Недопустимый переход статуса: ${existing.status} → ${body.status}` },
          { status: 409 },
        )
      }
      update.status = body.status
      // resolved_at — постоянная отметка о моменте разрешения инцидента.
      // Ставим при входе в resolved. Сохраняем при resolved → closed (закрытие
      // разрешённого инцидента не должно терять время разрешения). Очищаем
      // ТОЛЬКО при повторном открытии resolved → investigating.
      if (body.status === 'resolved') {
        update.resolved_at = new Date().toISOString()
      } else if (existing.status === 'resolved' && body.status === 'investigating') {
        update.resolved_at = null
      }
    }

    if (body.severity !== undefined) {
      if (!isSeverity(body.severity)) {
        return NextResponse.json({ error: 'Неверная серьёзность' }, { status: 400 })
      }
      update.severity = body.severity
    }

    if (body.resolution !== undefined) {
      update.resolution = body.resolution?.trim() || null
    }

    if (body.assigned_to !== undefined) {
      update.assigned_to = body.assigned_to ? String(body.assigned_to).trim() : null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('security_incidents')
      .update(update)
      .eq('id', params.id)
      .select(COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(await withMeta(sb, data as unknown as IncidentRow))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
