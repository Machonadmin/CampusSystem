import { describe, it, expect } from 'vitest'
import { toCents, sumCents, centsToNumber, computeLedgerTotals } from './money'

describe('toCents', () => {
  it('переводит число в целые копейки', () => {
    expect(toCents(10)).toBe(1000)
    expect(toCents(10.5)).toBe(1050)
    expect(toCents(0)).toBe(0)
  })

  it('принимает строку от PostgREST', () => {
    expect(toCents('10.00')).toBe(1000)
    expect(toCents('1234.56')).toBe(123456)
  })

  it('округляет копейки, а не режет', () => {
    expect(toCents(0.005)).toBe(1) // 0.5 копейки → 1
    expect(toCents(10.005)).toBe(1001)
  })

  it('обрабатывает отрицательные суммы', () => {
    expect(toCents(-10.5)).toBe(-1050)
  })
})

describe('sumCents', () => {
  it('пустой массив → 0', () => {
    expect(sumCents([])).toBe(0)
  })

  it('суммирует без float-дрейфа (0.1 + 0.2)', () => {
    expect(sumCents([{ amount: 0.1 }, { amount: 0.2 }])).toBe(30)
  })

  it('суммирует смешанные строки и числа', () => {
    expect(sumCents([{ amount: '100.10' }, { amount: 200.2 }, { amount: '0.7' }])).toBe(30100)
  })
})

describe('centsToNumber', () => {
  it('переводит копейки в число с двумя знаками', () => {
    expect(centsToNumber(1000)).toBe(10)
    expect(centsToNumber(123456)).toBe(1234.56)
    expect(centsToNumber(0)).toBe(0)
    expect(centsToNumber(-1050)).toBe(-10.5)
  })
})

describe('computeLedgerTotals', () => {
  it('баланс = активные начисления − подтверждённые платежи', () => {
    const totals = computeLedgerTotals(
      [
        { amount: '1000.00', status: 'active' },
        { amount: '500.00', status: 'active' },
        { amount: '9999.00', status: 'cancelled' }, // не считается
      ],
      [
        { amount: '600.00', status: 'approved' },
        { amount: '100.00', status: 'pending' },
        { amount: '7777.00', status: 'cancelled' }, // не считается
      ],
    )
    expect(totals.charges_active).toBe(1500)
    expect(totals.payments_approved).toBe(600)
    expect(totals.payments_pending).toBe(100)
    expect(totals.balance).toBe(900)
  })

  it('pending-платёж НЕ уменьшает баланс', () => {
    const totals = computeLedgerTotals(
      [{ amount: '1000.00', status: 'active' }],
      [{ amount: '1000.00', status: 'pending' }],
    )
    expect(totals.balance).toBe(1000)
    expect(totals.payments_pending).toBe(1000)
  })

  it('переплата даёт отрицательный баланс', () => {
    const totals = computeLedgerTotals(
      [{ amount: '500.00', status: 'active' }],
      [{ amount: '800.00', status: 'approved' }],
    )
    expect(totals.balance).toBe(-300)
  })

  it('пустой ПНК → все нули', () => {
    const totals = computeLedgerTotals([], [])
    expect(totals).toEqual({
      charges_active: 0,
      payments_approved: 0,
      payments_pending: 0,
      discounts_total: 0,
      balance: 0,
    })
  })

  it('копеечные суммы без float-дрейфа', () => {
    const totals = computeLedgerTotals(
      [{ amount: '0.10', status: 'active' }, { amount: '0.20', status: 'active' }],
      [{ amount: '0.30', status: 'approved' }],
    )
    expect(totals.balance).toBe(0)
  })

  it('скидка уменьшает долг (25% от 210000 → долг 157500)', () => {
    const totals = computeLedgerTotals(
      [{ amount: '210000', status: 'active' }],
      [],
      [{ amount: '52500' }], // 25% скидка
    )
    expect(totals.discounts_total).toBe(52500)
    expect(totals.balance).toBe(157500)
  })

  it('скидка + оплата: 210000 − 52500 скидка − 100000 оплата = 57500', () => {
    const totals = computeLedgerTotals(
      [{ amount: '210000', status: 'active' }],
      [{ amount: '100000', status: 'approved' }],
      [{ amount: '52500' }],
    )
    expect(totals.balance).toBe(57500)
  })
})
