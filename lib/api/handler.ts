import { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { serverT } from '@/lib/i18n/api-errors'

type ApiError = { status?: number; message?: string; code?: string; apiCode?: string }

/**
 * Общий маппинг ошибок Postgres (constraint violations + коды из наших RPC
 * через RAISE EXCEPTION ... USING ERRCODE) на HTTP-статусы.
 * Раньше это было продублировано в каждом route.ts как mapDbError().
 *
 * Сообщения-фолбэки теперь берутся из неймспейса errors (serverT) по языку
 * запроса. Там, где раньше пробрасывался error.message (текст из БД/RPC),
 * поведение сохранено: сначала error.message, и только если его нет — перевод.
 * Возвращаемый `code` — машинно-стабильный идентификатор ошибки.
 */
export function mapPgError(
  error: { code?: string; message?: string },
): { status: number; message: string; code: string } {
  if (error.code === '23505') return { status: 409, message: serverT('record_exists'), code: 'record_exists' }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference'), code: 'invalid_reference' }
  if (error.code === '23514') return { status: 400, message: serverT('db_constraint'), code: 'db_constraint' }
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_field_value_status'), code: 'invalid_field_value_status' }
  if (error.code === '22023') return { status: 400, message: error.message ?? serverT('invalid_input'), code: 'invalid_input' }
  if (error.code === 'P0002') return { status: 404, message: error.message ?? serverT('record_not_found'), code: 'record_not_found' }
  if (error.code === 'P0001') return { status: 409, message: error.message ?? serverT('state_conflict'), code: 'state_conflict' }
  return { status: 500, message: error.message ?? serverT('db_error'), code: 'db_error' }
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
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
  return NextResponse.json(
    { error: e.message ?? serverT('generic_error'), code: e.apiCode ?? 'generic_error' },
    { status: e.status ?? 500 },
  )
}

/**
 * Парсит JSON body запроса и валидирует его через Zod-схему.
 * При ошибке бросает Error со status=400 — перехватывается тем же catch,
 * что и остальные ошибки в handler'е (см. jsonError выше). Верхнеуровневый
 * префикс переводится (serverT), а поля zod (детализация) сохраняются как есть.
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
    throw Object.assign(new Error(`${serverT('validation_error')}: ${details}`), {
      status: 400,
      apiCode: 'invalid_input',
    })
  }
  return parsed.data
}
