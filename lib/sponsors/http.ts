import { serverT } from '@/lib/i18n/api-errors'
// ─── Единое отображение ошибок БД → HTTP для модуля «Спонсоры» ────────────────
//
// Локальная копия (модули decoupled — тот же приём, что в остальных модулях):
// одинаковое покрытие кодов PostgreSQL/PostgREST во всех эндпоинтах модуля.
// Покрывает и денежные коды (22003 numeric overflow), т.к. donations.amount —
// NUMERIC(12,2), как в lib/finance/http.ts.

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
    case '22003':                    // numeric_field_overflow (сумма вне NUMERIC(12,2))
      return { status: 400, message: serverT('amount_out_of_range') }
    case '23503':                    // foreign_key_violation (напр. несуществующий sponsor_id)
      return { status: 400, message: serverT('invalid_reference') }
    case '23514':                    // check_violation (недопустимый sponsor_type/status/amount)
      return { status: 400, message: serverT('db_constraint_amount_type_status') }
    case '23505':                    // unique_violation
      return { status: 409, message: serverT('record_exists') }
    default:
      return { status: 500, message: error.message ?? serverT('db_error') }
  }
}
