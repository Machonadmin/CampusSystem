import { describe, it, expect } from 'vitest'
import { isSponsorType, isDonationStatus, isValidAmount } from './validation'

// Type-guards отсекают кривой ввод ДО записи в БД: иначе CHECK-колонка вернула
// бы 23514/22003 и пользователь увидел бы общий 500 вместо понятного 400.
describe('isSponsorType / isDonationStatus', () => {
  it('принимает ровно допустимые значения', () => {
    for (const v of ['individual', 'organization', 'foundation']) expect(isSponsorType(v), v).toBe(true)
    for (const v of ['pledged', 'received', 'cancelled']) expect(isDonationStatus(v), v).toBe(true)
  })
  it('отвергает регистр, пустое, посторонние типы и значения другого перечисления', () => {
    for (const v of ['Individual', 'INDIVIDUAL', '', 'person', null, undefined, 0, 1, {}, [], true]) {
      expect(isSponsorType(v), JSON.stringify(v)).toBe(false)
    }
    expect(isSponsorType('pledged')).toBe(false)        // значение из другого перечисления
    expect(isDonationStatus('individual')).toBe(false)
  })
})

describe('isValidAmount — деньги', () => {
  it('принимает конечные числа ≥ 0, в т.ч. строками (форма шлёт строки)', () => {
    for (const v of [0, 1, 0.5, 1000000, '0', '12.34', ' 42 ', 1e6]) {
      expect(isValidAmount(v), JSON.stringify(v)).toBe(true)
    }
  })
  it('отвергает отрицательные суммы', () => {
    for (const v of [-1, -0.01, '-5']) expect(isValidAmount(v), JSON.stringify(v)).toBe(false)
  })
  it('отвергает NaN/Infinity и нечисловой мусор', () => {
    for (const v of [NaN, Infinity, -Infinity, 'abc', '12abc', '1,5', {}, []]) {
      expect(isValidAmount(v), JSON.stringify(v)).toBe(false)
    }
  })
  it('отвергает null/undefined/пустую строку и boolean (Number(true)===1 — ловушка)', () => {
    for (const v of [null, undefined, '', true, false]) {
      expect(isValidAmount(v), JSON.stringify(v)).toBe(false)
    }
  })
})
