import { describe, it, expect } from 'vitest'
import { dateInAnyRange, type ExemptionRange } from './kodesh-exceptions'

describe('dateInAnyRange (חריגות קודש — активность освобождения на дату)', () => {
  it('пусто → никогда не освобождена', () => {
    expect(dateInAnyRange([], '2026-09-01')).toBe(false)
  })

  it('границы включительны: from и to попадают', () => {
    const r: ExemptionRange[] = [{ from: '2026-09-01', to: '2026-09-30' }]
    expect(dateInAnyRange(r, '2026-09-01')).toBe(true)  // ровно начало
    expect(dateInAnyRange(r, '2026-09-15')).toBe(true)  // внутри
    expect(dateInAnyRange(r, '2026-09-30')).toBe(true)  // ровно конец
  })

  it('вне диапазона — не освобождена', () => {
    const r: ExemptionRange[] = [{ from: '2026-09-01', to: '2026-09-30' }]
    expect(dateInAnyRange(r, '2026-08-31')).toBe(false) // за день до
    expect(dateInAnyRange(r, '2026-10-01')).toBe(false) // на день после
  })

  it('to = null → бессрочно, любая дата от from и позже', () => {
    const r: ExemptionRange[] = [{ from: '2026-09-01', to: null }]
    expect(dateInAnyRange(r, '2026-08-31')).toBe(false)
    expect(dateInAnyRange(r, '2026-09-01')).toBe(true)
    expect(dateInAnyRange(r, '2030-01-01')).toBe(true)
  })

  it('несколько диапазонов — освобождена, если попала хотя бы в один', () => {
    const r: ExemptionRange[] = [
      { from: '2026-09-01', to: '2026-09-10' },
      { from: '2026-11-01', to: null },
    ]
    expect(dateInAnyRange(r, '2026-09-05')).toBe(true)
    expect(dateInAnyRange(r, '2026-10-15')).toBe(false) // в разрыве между
    expect(dateInAnyRange(r, '2026-12-01')).toBe(true)
  })

  it('таймстамп даты урока сравнивается по дневной части', () => {
    const r: ExemptionRange[] = [{ from: '2026-09-01', to: '2026-09-30' }]
    expect(dateInAnyRange(r, '2026-09-30T23:59:00Z')).toBe(true)
    expect(dateInAnyRange(r, '2026-10-01T00:00:00Z')).toBe(false)
  })
})
