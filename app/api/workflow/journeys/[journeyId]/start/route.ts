import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * POST /api/workflow/journeys/[journeyId]/start — запустить процесс для journey.
 *
 * Зачем маршрут вообще нужен. Процесс «Набор» стартует АВТОМАТИЧЕСКИ при
 * создании лида, но намеренно некритично: если start_process упал (например,
 * у шаблона не оказалось начальных этапов), лид всё равно создаётся — просто
 * без процесса. До этого маршрута такой лид было НЕВОЗМОЖНО починить из
 * приложения: ни кнопки, ни эндпоинта — только SQL. Ровно это и случилось
 * 2026-09, когда очистка тестовых данных снесла stage_transitions.
 *
 * Второе применение (запрос владельца): «дать упавшему лиду второй шанс».
 * Закрытый процесс НЕ меняет education_status и НЕ удаляет journey — девушка
 * остаётся лидом со всей историей, а start_process, чья идемпотентность
 * смотрит только на status='active', заводит новый экземпляр поверх
 * отменённого. Старый остаётся в истории как есть.
 *
 * Право: manage_leads на подразделение journey (то же, что и на работу с
 * этапами набора). Отдельной привилегии сознательно не заводим.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { journeyId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, primary_department_id')
      .eq('id', params.journeyId)
      .maybeSingle()
    if (!journey) return apiError('journey_not_found', 404)

    const dept = (journey as { primary_department_id: string | null }).primary_department_id
    await requireEducationPrivilege('manage_leads', dept ? { department_id: dept } : undefined)

    const body = await request.json().catch(() => ({})) as { process_code?: string }
    const processCode = body.process_code?.trim() || 'recruitment'

    const { data, error } = await sb.rpc('start_process', {
      p_process_code: processCode,
      p_journey_id: params.journeyId,
      p_actor_id: session.person_id,
    })
    // Движок сообщает о неполной конфигурации шаблона своими кодами: P0002 —
    // шаблона нет, 22023 — у него нет этапов/начальных этапов. Отдаём их как
    // 409 с исходным текстом, чтобы на экране было видно, ЧТО именно чинить,
    // а не безликое «ошибка сервера».
    if (error) {
      if (error.code === 'P0002' || error.code === '22023') {
        return NextResponse.json({ error: error.message, code: 'process_template_incomplete' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data ?? {}, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
