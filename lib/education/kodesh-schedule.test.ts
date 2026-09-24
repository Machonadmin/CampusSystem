import { describe, it, expect } from 'vitest'
import { collidesWithKodesh, KODESH_DAYS, KODESH_WINDOWS } from './kodesh-schedule'

// Критичная бизнес-логика: слот в кодеш-время уходит на аישור מנהל.
// Ошибка здесь = либо лишние согласования, либо тихий обход резерва.
describe('collidesWithKodesh', () => {
  it('попадание внутрь первого окна (Пн 09:15–10:30)', () => {
    expect(collidesWithKodesh(1, '09:30', '10:00')).toBe(true)
  })

  it('точное совпадение с окном — конфликт', () => {
    expect(collidesWithKodesh(2, '09:15', '10:30')).toBe(true)
    expect(collidesWithKodesh(3, '11:00', '12:10')).toBe(true)
  })

  it('частичное перекрытие с начала и с конца', () => {
    expect(collidesWithKodesh(1, '08:30', '09:30')).toBe(true) // хвост входит в окно
    expect(collidesWithKodesh(1, '10:00', '11:30')).toBe(true) // пересекает оба края
  })

  it('слот, накрывающий окно целиком — конфликт', () => {
    expect(collidesWithKodesh(4, '09:00', '13:00')).toBe(true)
  })

  it('касание границ НЕ конфликт (интервалы полуоткрытые)', () => {
    expect(collidesWithKodesh(1, '08:00', '09:15')).toBe(false) // заканчивается ровно на старте
    expect(collidesWithKodesh(1, '10:30', '11:00')).toBe(false) // окно между блоками
    expect(collidesWithKodesh(1, '12:10', '13:00')).toBe(false) // начинается ровно на конце
  })

  it('дневное время — свободно', () => {
    expect(collidesWithKodesh(1, '13:00', '14:30')).toBe(false)
  })

  it('Вс/Пт/Сб — кодеш не зарезервирован (owner: Пн–Чт)', () => {
    expect(collidesWithKodesh(7, '09:30', '10:00')).toBe(false) // Вс
    expect(collidesWithKodesh(5, '09:30', '10:00')).toBe(false) // Пт
    expect(collidesWithKodesh(6, '09:30', '10:00')).toBe(false) // Сб
  })

  it('секунды в HH:MM:SS парсятся', () => {
    expect(collidesWithKodesh(1, '09:15:00', '10:30:00')).toBe(true)
  })

  it('битое время → не конфликт (мягкое правило, не 500)', () => {
    expect(collidesWithKodesh(1, 'abc', '10:00')).toBe(false)
    expect(collidesWithKodesh(1, '25:00', '26:00')).toBe(false)
  })

  it('константы соответствуют утренним блокам Пн–Чт', () => {
    expect(KODESH_DAYS).toEqual([1, 2, 3, 4])
    expect(KODESH_WINDOWS).toHaveLength(2)
  })
})
