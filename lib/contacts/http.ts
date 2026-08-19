import { serverT } from '@/lib/i18n/api-errors'
// ─── Единое отображение ошибок БД → HTTP для модуля «Контакты» ────────────────
//
// Локальная копия (модули decoupled — тот же приём, что в остальных модулях):
// одинаковое покрытие кодов PostgreSQL/PostgREST во всех эндпоинтах модуля.

export function mapDbError(
  error: { code?: string; message?: string },
): { status: number; message: string } {
  switch (error.code) {
    case 'PGRST116':                 // .single() не нашёл строку (в т.ч. гонка)
      return { status: 404, message: serverT('record_not_found') }
    case '22P02':                    // invalid_text_representation (кривой uuid и т.п.)
      return { status: 400, message: serverT('invalid_field_value') }
    case '22007':                    // invalid_datetime_format
    case '22008':                    // datetime_field_overflow
      return { status: 400, message: serverT('invalid_date_format_generic') }
    case '23503':                    // foreign_key_violation
      return { status: 400, message: serverT('invalid_reference') }
    case '23505':                    // unique_violation
      return { status: 409, message: serverT('record_exists') }
    case '23514':                    // check_violation (напр. недопустимый contact_type/category)
      return { status: 400, message: serverT('db_constraint') }
    default:
      return { status: 500, message: error.message ?? serverT('db_error') }
  }
}
