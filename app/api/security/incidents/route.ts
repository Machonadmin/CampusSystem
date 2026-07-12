import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireSecurityPrivilege } from '@/lib/security/permissions'
import { mapDbError } from '@/lib/security/http'
import { isCategory, isSeverity, isStatus } from '@/lib/security/validation'
import { severityRank } from '@/lib/security/incidents'
import { buildingNamesByIds } from '@/lib/security/locations-server'
import type { SecurityIncidentInsert, SecurityIncidentRow } from '@/types/database'

/**
 * GET  /api/security/incidents — журнал инцидентов с фильтрами ?status ?severity
 *   ?category ?building_id. К каждому инциденту добавляется имя здания (пакетно,
 *   без N+1). Сортировка: серьёзность по рангу убыв., затем свежие происшествия
 *   выше. Пагинация ?page ?page_size. Право: security.view.
 * POST /api/security/incidents — создать инцидент. Право: security.manage.
 */

const COLS =
  'id, occurred_at, building_id, location_text, category, severity, title, description, status, reported_by, assigned_to, resolution, resolved_at, created_by, created_at, updated_at'

const PAGE = 1000                       // размер страницы чтения из БД (без N+1)
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

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

export async function GET(request: NextRequest) {
  try {
    await requireSecurityPrivilege('view')

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const severity = searchParams.get('severity')
    const category = searchParams.get('category')
    const buildingId = searchParams.get('building_id')

    if (status && !isStatus(status)) {
      return apiError('invalid_status', 400)
    }
    if (severity && !isSeverity(severity)) {
      return apiError('invalid_severity', 400)
    }
    if (category && !isCategory(category)) {
      return apiError('invalid_category', 400)
    }

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSizeRaw = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw))

    const sb = createServerClient()

    // Читаем ВСЕ отфильтрованные инциденты постранично: сортировка по рангу
    // серьёзности не выражается в SQL (порядок не алфавитный), поэтому сортируем
    // и пагинируем ответ в JS.
    const rows: IncidentRow[] = []
    let offset = 0
    for (;;) {
      let qb = sb.from('security_incidents').select(COLS)
      // status/severity/category уже провалидированы выше; каст сужает string до
      // литеральных union-типов колонок для типизированного клиента.
      if (status) qb = qb.eq('status', status as SecurityIncidentRow['status'])
      if (severity) qb = qb.eq('severity', severity as SecurityIncidentRow['severity'])
      if (category) qb = qb.eq('category', category as SecurityIncidentRow['category'])
      if (buildingId) qb = qb.eq('building_id', buildingId)

      const { data, error } = await qb
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error

      const batch = (data ?? []) as unknown as IncidentRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const buildingMap = await buildingNamesByIds(sb, rows.map(r => r.building_id ?? '').filter(Boolean))

    const enriched = rows.map(r => ({
      ...r,
      building_name: r.building_id ? buildingMap.get(r.building_id) ?? null : null,
    }))

    // Серьёзность по рангу убыв., затем свежие происшествия выше (occurred_at desc).
    enriched.sort((a, b) => {
      const sr = severityRank(b.severity) - severityRank(a.severity)
      if (sr !== 0) return sr
      if (a.occurred_at > b.occurred_at) return -1
      if (a.occurred_at < b.occurred_at) return 1
      return 0
    })

    const total = enriched.length
    const start = (page - 1) * pageSize
    const pageRows = enriched.slice(start, start + pageSize)

    return NextResponse.json({ incidents: pageRows, page, page_size: pageSize, total })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSecurityPrivilege('manage')

    const body = await request.json() as {
      title?: string
      description?: string | null
      occurred_at?: string | null
      building_id?: string | null
      location_text?: string | null
      category?: string
      severity?: string
    }

    const title = body.title?.trim()
    if (!title) return apiError('title_field_required', 400)

    let category = 'other'
    if (body.category !== undefined && body.category !== null && body.category !== '') {
      if (!isCategory(body.category)) {
        return apiError('invalid_category', 400)
      }
      category = body.category
    }

    let severity = 'medium'
    if (body.severity !== undefined && body.severity !== null && body.severity !== '') {
      if (!isSeverity(body.severity)) {
        return apiError('invalid_severity', 400)
      }
      severity = body.severity
    }

    const insert: SecurityIncidentInsert = {
      title,
      description: body.description?.trim() || null,
      building_id: body.building_id?.trim() || null,
      location_text: body.location_text?.trim() || null,
      category: category as SecurityIncidentInsert['category'],
      severity: severity as SecurityIncidentInsert['severity'],
      reported_by: session.person_id,
      created_by: session.person_id,
    }
    // occurred_at опционален: если не задан — сработает DEFAULT now() в БД.
    const occurredAt = body.occurred_at?.trim()
    if (occurredAt) insert.occurred_at = occurredAt

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('security_incidents')
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
