import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
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
 * Ответ: [{ id, name, name_he, name_en, institution_name, institution_name_he,
 * institution_name_en }] — отсортировано по учреждению и sort_order направления.
 * name / institution_name — русские (как раньше); переводы клиент выбирает сам
 * (localizedName), иначе публичная страница на иврите показывала программы по-русски.
 */
type Inst = { id: string; name: string; name_he?: string | null; name_en?: string | null }
type Dir = { id: string; name_ru: string; name_he?: string | null; name_en?: string | null; department_id: string }
export async function GET() {
  try {
    const sb = createServerClient()

    // Колонки переводов могут отсутствовать, если миграция ещё не прогнана —
    // тогда повторяем запрос без них (страница заявки не должна ломаться).
    const instQ = (cols: string) => sb.from('departments').select(cols).eq('is_educational_institution', true)
    let instRes = await instQ('id, name, name_he, name_en')
    if (instRes.error) instRes = await instQ('id, name')
    if (instRes.error) throw instRes.error
    const institutions = (instRes.data ?? []) as unknown as Inst[]
    if (institutions.length === 0) return NextResponse.json([])

    const instMap = new Map(institutions.map(d => [d.id, d]))

    const dirQ = (cols: string) => sb
      .from('reference_directions')
      .select(cols)
      .in('department_id', institutions.map(d => d.id))
      .eq('is_active', true)
      .order('department_id')
      .order('sort_order', { ascending: true })
    let dirRes = await dirQ('id, name_ru, name_he, name_en, department_id, sort_order')
    if (dirRes.error) dirRes = await dirQ('id, name_ru, department_id, sort_order')
    if (dirRes.error) throw dirRes.error
    const directions = (dirRes.data ?? []) as unknown as Dir[]

    const result = directions.map(d => {
      const inst = instMap.get(d.department_id)
      return {
        id: d.id,
        name: d.name_ru,
        name_he: d.name_he ?? null,
        name_en: d.name_en ?? null,
        institution_name: inst?.name ?? null,
        institution_name_he: inst?.name_he ?? null,
        institution_name_en: inst?.name_en ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
