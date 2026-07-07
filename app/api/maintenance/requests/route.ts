import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { isCategory, isPriority, isStatus } from '@/lib/maintenance/validation'
import { isOverdue, priorityRank } from '@/lib/maintenance/tickets'
import { buildingNamesByIds, roomNumbersByIds } from '@/lib/maintenance/locations-server'
import type { MaintenanceRequestInsert, MaintenanceRequestRow } from '@/types/database'

/**
 * GET  /api/maintenance/requests — заявки с фильтрами ?status ?priority
 *   ?building_id ?assigned=me. К каждой заявке добавляются имена здания/комнаты
 *   (пакетно, без N+1) и флаг is_overdue. Сортировка: приоритет по рангу убыв.,
 *   затем старые выше. Пагинация ?page ?page_size. Право: maintenance.view.
 * POST /api/maintenance/requests — создать заявку. Право: maintenance.manage.
 */

const COLS =
  'id, title, description, building_id, room_id, location_text, category, priority, status, reported_by, assigned_to, reported_at, resolved_at, created_at, updated_at'

const PAGE = 1000                       // размер страницы чтения из БД (без N+1)
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

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

export async function GET(request: NextRequest) {
  try {
    const session = await requireMaintenancePrivilege('view')

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const buildingId = searchParams.get('building_id')
    const assignedMe = searchParams.get('assigned') === 'me'

    if (status && !isStatus(status)) {
      return NextResponse.json({ error: 'Неверный статус' }, { status: 400 })
    }
    if (priority && !isPriority(priority)) {
      return NextResponse.json({ error: 'Неверный приоритет' }, { status: 400 })
    }

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSizeRaw = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw))

    const sb = createServerClient()

    // Читаем ВСЕ отфильтрованные заявки постранично: сортировка по рангу
    // приоритета не выражается в SQL (порядок не алфавитный), поэтому
    // сортируем и пагинируем ответ в JS.
    const rows: RequestRow[] = []
    let offset = 0
    for (;;) {
      let qb = sb.from('maintenance_requests').select(COLS)
      // status/priority уже провалидированы isStatus/isPriority выше; каст
      // сужает string до литеральных union-типов колонок для типизированного клиента.
      if (status) qb = qb.eq('status', status as MaintenanceRequestRow['status'])
      if (priority) qb = qb.eq('priority', priority as MaintenanceRequestRow['priority'])
      if (buildingId) qb = qb.eq('building_id', buildingId)
      if (assignedMe) qb = qb.eq('assigned_to', session.person_id)

      const { data, error } = await qb
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error

      const batch = (data ?? []) as unknown as RequestRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const now = new Date().toISOString()

    const buildingMap = await buildingNamesByIds(sb, rows.map(r => r.building_id ?? '').filter(Boolean))
    const roomMap = await roomNumbersByIds(sb, rows.map(r => r.room_id ?? '').filter(Boolean))

    const enriched = rows.map(r => ({
      ...r,
      building_name: r.building_id ? buildingMap.get(r.building_id) ?? null : null,
      room_number: r.room_id ? roomMap.get(r.room_id) ?? null : null,
      is_overdue: isOverdue(r, now),
    }))

    enriched.sort((a, b) => {
      const pr = priorityRank(b.priority) - priorityRank(a.priority)
      if (pr !== 0) return pr
      if (a.reported_at < b.reported_at) return -1
      if (a.reported_at > b.reported_at) return 1
      return 0
    })

    const total = enriched.length
    const start = (page - 1) * pageSize
    const pageRows = enriched.slice(start, start + pageSize)

    return NextResponse.json({ requests: pageRows, page, page_size: pageSize, total })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMaintenancePrivilege('manage')

    const body = await request.json() as {
      title?: string
      description?: string | null
      building_id?: string | null
      room_id?: string | null
      location_text?: string | null
      category?: string
      priority?: string
    }

    const title = body.title?.trim()
    if (!title) return NextResponse.json({ error: 'title обязателен' }, { status: 400 })

    let category = 'other'
    if (body.category !== undefined && body.category !== null && body.category !== '') {
      if (!isCategory(body.category)) {
        return NextResponse.json({ error: 'Неверная категория' }, { status: 400 })
      }
      category = body.category
    }

    let priority = 'normal'
    if (body.priority !== undefined && body.priority !== null && body.priority !== '') {
      if (!isPriority(body.priority)) {
        return NextResponse.json({ error: 'Неверный приоритет' }, { status: 400 })
      }
      priority = body.priority
    }

    const insert: MaintenanceRequestInsert = {
      title,
      description: body.description?.trim() || null,
      building_id: body.building_id?.trim() || null,
      room_id: body.room_id?.trim() || null,
      location_text: body.location_text?.trim() || null,
      category: category as MaintenanceRequestInsert['category'],
      priority: priority as MaintenanceRequestInsert['priority'],
      reported_by: session.person_id,
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('maintenance_requests')
      .insert(insert as any)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
