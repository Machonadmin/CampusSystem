import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { isPriority, isStatus } from '@/lib/maintenance/validation'
import { canTransition, isOverdue } from '@/lib/maintenance/tickets'
import { buildingNamesByIds, roomNumbersByIds } from '@/lib/maintenance/locations-server'
import type { MaintenanceRequestUpdate } from '@/types/database'

/**
 * GET   /api/maintenance/requests/[id] — заявка + имена локации + is_overdue.
 *   Право: maintenance.view.
 * PATCH /api/maintenance/requests/[id] — смена статуса (валидируется через
 *   canTransition → 409 на недопустимом переходе), назначение assigned_to,
 *   приоритет, описание. При status='resolved' проставляется resolved_at=now();
 *   сохраняется при resolved→closed, очищается только при переоткрытии
 *   resolved→in_progress. Право: maintenance.manage.
 */

const COLS =
  'id, title, description, building_id, room_id, location_text, category, priority, status, reported_by, assigned_to, reported_at, resolved_at, created_at, updated_at'

interface RequestRow {
  id: string
  title: string
  description: string | null
  building_id: string | null
  room_id: string | null
  location_text: string | null
  category: string
  priority: string
  status: string
  reported_by: string | null
  assigned_to: string | null
  reported_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type SB = ReturnType<typeof createServerClient>

/** Имя человека по id (deploy-safe: при любой ошибке — null). */
async function personName(sb: SB, id: string | null): Promise<string | null> {
  if (!id) return null
  try {
    const { data } = await sb.from('persons').select('full_name, hebrew_name').eq('id', id).maybeSingle()
    const p = data as { full_name?: string | null; hebrew_name?: string | null } | null
    return p ? (p.full_name || p.hebrew_name || null) : null
  } catch {
    return null
  }
}

/** Дополняет строку заявки именами локации, ответственного и флагом просрочки. */
async function withMeta(sb: SB, row: RequestRow) {
  const buildingMap = await buildingNamesByIds(sb, row.building_id ? [row.building_id] : [])
  const roomMap = await roomNumbersByIds(sb, row.room_id ? [row.room_id] : [])
  return {
    ...row,
    building_name: row.building_id ? buildingMap.get(row.building_id) ?? null : null,
    room_number: row.room_id ? roomMap.get(row.room_id) ?? null : null,
    assigned_to_name: await personName(sb, row.assigned_to),
    is_overdue: isOverdue(row, new Date().toISOString()),
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireMaintenancePrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('maintenance_requests').select(COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return apiError('application_not_found', 404)

    return NextResponse.json(await withMeta(sb, data as unknown as RequestRow))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireMaintenancePrivilege('manage')

    const body = await request.json() as {
      status?: string
      assigned_to?: string | null
      priority?: string
      description?: string | null
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('maintenance_requests')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('application_not_found', 404)

    const update: MaintenanceRequestUpdate = {}

    if (body.status !== undefined) {
      if (!isStatus(body.status)) {
        return apiError('invalid_status', 400)
      }
      if (!canTransition(existing.status, body.status)) {
        return NextResponse.json(
          { error: `${serverT('invalid_status_transition')}: ${existing.status} → ${body.status}` },
          { status: 409 },
        )
      }
      update.status = body.status
      // resolved_at — постоянная отметка о моменте выполнения работ.
      // Ставим при входе в resolved. Сохраняем при resolved → closed (закрытие
      // выполненной заявки не должно терять время выполнения). Очищаем ТОЛЬКО
      // при переоткрытии resolved → in_progress.
      if (body.status === 'resolved') {
        update.resolved_at = new Date().toISOString()
      } else if (existing.status === 'resolved' && body.status === 'in_progress') {
        update.resolved_at = null
      }
    }

    if (body.priority !== undefined) {
      if (!isPriority(body.priority)) {
        return apiError('invalid_priority', 400)
      }
      update.priority = body.priority
    }

    if (body.description !== undefined) {
      update.description = body.description?.trim() || null
    }

    if (body.assigned_to !== undefined) {
      update.assigned_to = body.assigned_to ? String(body.assigned_to).trim() : null
    }

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('maintenance_requests')
      .update(update)
      .eq('id', params.id)
      .select(COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(await withMeta(sb, data as unknown as RequestRow))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
