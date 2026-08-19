import { describe, it, expect } from 'vitest'
import { mapDbError } from './http'

describe('mapDbError', () => {
  it('PGRST116 (single не нашёл) → 404', () => {
    expect(mapDbError({ code: 'PGRST116' })).toEqual({ status: 404, message: 'Запись не найдена' })
  })

  it('невалидный uuid 22P02 → 400', () => {
    expect(mapDbError({ code: '22P02' }).status).toBe(400)
  })

  it('ошибки формата/переполнения даты → 400', () => {
    expect(mapDbError({ code: '22007' }).status).toBe(400)
    expect(mapDbError({ code: '22008' }).status).toBe(400)
  })

  it('переполнение numeric 22003 → 400', () => {
    expect(mapDbError({ code: '22003' }).status).toBe(400)
  })

  it('нарушение внешнего ключа 23503 → 400', () => {
    expect(mapDbError({ code: '23503' }).status).toBe(400)
  })

  it('нарушение check 23514 → 400', () => {
    expect(mapDbError({ code: '23514' }).status).toBe(400)
  })

  it('уникальность 23505 → 409', () => {
    expect(mapDbError({ code: '23505' })).toEqual({ status: 409, message: 'Запись уже существует' })
  })

  it('неизвестный код → 500 с сообщением из ошибки', () => {
    expect(mapDbError({ code: 'ZZZ', message: 'boom' })).toEqual({ status: 500, message: 'boom' })
  })

  it('без кода и сообщения → 500 с дефолтным текстом', () => {
    expect(mapDbError({})).toEqual({ status: 500, message: 'Ошибка БД' })
  })
})
