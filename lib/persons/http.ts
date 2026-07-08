// ─── Единое отображение ошибок БД → HTTP для модуля «Люди» ────────────────────
//
// Локальная копия (модули decoupled — тот же приём, что в contacts/finance):
// одинаковое покрытие кодов PostgreSQL/PostgREST во всех эндпоинтах модуля.
// Справочник ЧИТАЮЩИЙ, поэтому на практике встречается в основном PGRST116
// (.single() не нашёл строку) и 22P02 (кривой uuid), но покрытие полное — как
// в остальных модулях.

export function mapDbError(
  error: { code?: string; message?: string },
): { status: number; message: string } {
  switch (error.code) {
    case 'PGRST116':                 // .single() не нашёл строку (в т.ч. гонка)
      return { status: 404, message: 'Запись не найдена' }
    case '22P02':                    // invalid_text_representation (кривой uuid и т.п.)
      return { status: 400, message: 'Неверное значение поля' }
    case '22007':                    // invalid_datetime_format
    case '22008':                    // datetime_field_overflow
      return { status: 400, message: 'Неверный формат даты' }
    case '23503':                    // foreign_key_violation
      return { status: 400, message: 'Ссылка на несуществующую запись' }
    case '23505':                    // unique_violation
      return { status: 409, message: 'Запись уже существует' }
    case '23514':                    // check_violation
      return { status: 400, message: 'Нарушено ограничение БД' }
    default:
      return { status: 500, message: error.message ?? 'Ошибка БД' }
  }
}
