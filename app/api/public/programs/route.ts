import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// Всегда свежий список программ (иначе Next закэширует ответ на этапе сборки).
export const dynamic = 'force-dynamic'

/**
 * GET /api/public/programs — ПУБЛИЧНЫЙ (без сессии; см. middleware
 * PUBLIC_API_PREFIXES). Возвращает активные направления обучения всех
 * учебных заведений (departments.is_educational_institution=true) плоским
 * списком — для селектора «программа/направление» в публичной форме заявки.
 *
 * Это маркетинговая информация (какие программы предлагает кампус), раскрывать
 * публично безопасно. Только чтение, без персональных данных.
 *
 * Ответ: [{ id, name, institution_name }] — отсортировано по учреждению и
 * sort_order направления.
 */
export async function GET() {
  try {
    const sb = createServerClient()

    const { data: institutions, error: instErr } = await sb
      .from('departments')
      .select('id, name')
      .eq('is_educational_institution', true)
    if (instErr) throw instErr
    if (!institutions || institutions.length === 0) return NextResponse.json([])

    const instMap = new Map(institutions.map(d => [d.id, d.name]))

    const { data: directions, error: dirErr } = await sb
      .from('reference_directions')
      .select('id, name_ru, department_id, sort_order')
      .in('department_id', institutions.map(d => d.id))
      .eq('is_active', true)
      .order('department_id')
      .order('sort_order', { ascending: true })
    if (dirErr) throw dirErr

    const result = (directions ?? []).map(d => ({
      id: d.id,
      name: d.name_ru,
      institution_name: instMap.get(d.department_id) ?? null,
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: 500 })
  }
}
