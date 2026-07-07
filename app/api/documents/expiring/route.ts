import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDocumentsPrivilege } from '@/lib/documents/permissions'
import { mapDbError } from '@/lib/documents/http'
import { isExpired, isExpiringSoon, daysUntilExpiry } from '@/lib/documents/expiry'
import { todayISO } from '@/lib/documents/records-server'

/**
 * GET /api/documents/expiring — worklist по всем студентам: АКТИВНЫЕ документы с
 *   датой окончания, разбитые на expired (уже просрочены) и expiring_soon
 *   (истекают в пределах порога) через чистые хелперы isExpired/isExpiringSoon. К
 *   каждому — имя студента. Право: documents.view.
 */

const PAGE = 1000

interface DocRow {
  id: string
  journey_id: string
  doc_type: string
  title: string
  expiry_date: string | null
  status: string
  journey: unknown
}

function studentName(row: DocRow): { full_name: string; hebrew_name: string | null } {
  const j = row.journey as {
    person?: { full_name?: string | null; hebrew_name?: string | null } | null
  } | null
  return {
    full_name: j?.person?.full_name ?? '',
    hebrew_name: j?.person?.hebrew_name ?? null,
  }
}

export async function GET() {
  try {
    await requireDocumentsPrivilege('view')

    const sb = createServerClient()

    const rows: DocRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('document_records')
        .select(`
          id, journey_id, doc_type, title, expiry_date, status,
          journey:education_journeys!document_records_journey_id_fkey(
            id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('status', 'active')
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as DocRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const today = todayISO()

    const map = (r: DocRow) => {
      const s = studentName(r)
      return {
        id: r.id,
        journey_id: r.journey_id,
        doc_type: r.doc_type,
        title: r.title,
        expiry_date: r.expiry_date,
        student_name: s.full_name,
        student_hebrew_name: s.hebrew_name,
        days_until: r.expiry_date ? daysUntilExpiry(r.expiry_date, today) : null,
      }
    }

    // status/expiry_date уже отфильтрованы в SQL; хелперы дают чистое разбиение
    // (граница «сегодня» → expiring_soon, НЕ expired).
    const expired = rows.filter(r => isExpired(r, today)).map(map)
    const expiring_soon = rows.filter(r => isExpiringSoon(r, today)).map(map)

    return NextResponse.json({
      expired,
      expiring_soon,
      counts: { expired: expired.length, expiring_soon: expiring_soon.length },
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
