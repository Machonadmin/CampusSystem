import { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'

type ApiError = { status?: number; message?: string; code?: string }

/**
 * Общий маппинг ошибок Postgres (constraint violations + коды из наших RPC
 * через RAISE EXCEPTION ... USING ERRCODE) на HTTP-статусы.
 * Раньше это было продублировано в каждом route.ts как mapDbError().
 */
export function mapPgError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: 'Запись уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД' }
  if (error.code === '22P02') return { status: 400, message: 'Неверное значение поля (возможно, неподдерживаемый статус)' }
  if (error.code === '22023') return { status: 400, message: error.message ?? 'Некорректные входные данные' }
  if (error.code === 'P0002') return { status: 404, message: error.message ?? 'Запись не найдена' }
  if (error.code === 'P0001') return { status: 409, message: error.message ?? 'Конфликт состояния' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * Единый catch-обработчик для route handlers.
 *
 * Пример:
 *   } catch (err: unknown) {
 *     return jsonError(err)
 *   }
 */
export function jsonError(err: unknown): NextResponse {
  const e = err as ApiError
  if (e.code) {
    const mapped = mapPgError(e)
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }
  return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
}

/**
 * Парсит JSON body запроса и валидирует его через Zod-схему.
 * При ошибке бросает Error со status=400 — перехватывается тем же catch,
 * что и остальные ошибки в handler'е (см. jsonError выше).
 *
 * Пример:
 *   const body = await parseBody(request, applicationSchema)
 */
export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const json = await request.json().catch(() => null)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(i => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ')
    throw Object.assign(new Error(`Ошибка валидации: ${details}`), { status: 400 })
  }
  return parsed.data
}
