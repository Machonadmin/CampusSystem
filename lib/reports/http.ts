// ─── Единое отображение ошибок БД → HTTP для модуля «Отчёты» ─────────────────
//
// Общий mapDbError вместо копий в каждом route: гарантирует, что покрытие
// кодов PostgreSQL/PostgREST одинаково во всех эндпоинтах. Идентичен
// lib/finance/http.ts / lib/psychologist/http.ts (модуль READ-ONLY, но ошибки
// БД маппятся тем же образом для единообразия ответов).

import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'

export function mapDbError(
  error: { code?: string; message?: string },
): { status: number; message: string } {
  switch (error.code) {
    case 'PGRST116':                 // .single() не нашёл строку
      return { status: 404, message: serverT('record_not_found') }
    case '22P02':                    // invalid_text_representation (кривой uuid и т.п.)
      return { status: 400, message: serverT('invalid_field_value') }
    case '22007':                    // invalid_datetime_format
    case '22008':                    // datetime_field_overflow
      return { status: 400, message: serverT('invalid_date_format_generic') }
    case '22003':                    // numeric_field_overflow
      return { status: 400, message: serverT('value_out_of_range') }
    case '23503':                    // foreign_key_violation
      return { status: 400, message: serverT('invalid_reference') }
    case '23514':                    // check_violation
      return { status: 400, message: serverT('db_constraint') }
    case '23505':                    // unique_violation
      return { status: 409, message: serverT('record_exists') }
    default:
      return { status: 500, message: error.message ?? serverT('db_error') }
  }
}

/**
 * Единый catch → HTTP-ответ для всех report-эндпоинтов. Ошибка авторизации
 * (throw из requireReportsPrivilege) несёт .status (401/403), но НЕ .code —
 * поэтому идёт по ветке e.status. Ошибка PostgREST/Postgres несёт .code —
 * маппится через mapDbError. Тело всегда { error: string }.
 */
export function errorResponse(err: unknown): NextResponse {
  const e = err as { status?: number; message?: string; code?: string }
  if (e.code) {
    const m = mapDbError(e)
    return NextResponse.json({ error: m.message }, { status: m.status })
  }
  return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
}
