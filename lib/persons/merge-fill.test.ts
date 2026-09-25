import { describe, it, expect } from 'vitest'
import { computeFill, isEmptyAddress } from './merge-fill'

const base = {
  first_name: 'Sarah', last_name: null, middle_name: '', hebrew_name: null, email: null,
  gender: null, birth_date: null, address: null, marital_status: null, nationality: null,
  passport_number: null, phones: ['0501234567'],
}

describe('computeFill', () => {
  it('заполняет только пустые поля, заполненные не трогает', () => {
    const { patch, filled } = computeFill(base, {
      first_name: 'Other', last_name: 'Cohen', middle_name: 'Lea', email: 'S@x.com ', birth_date: '2005-01-02',
    })
    expect(patch).toEqual({ last_name: 'Cohen', middle_name: 'Lea', email: 'S@x.com', birth_date: '2005-01-02' })
    expect(filled).toEqual(['last_name', 'middle_name', 'email', 'birth_date'])
  })
  it('пустые входящие значения игнорируются', () => {
    expect(computeFill(base, { last_name: '  ', email: null }).filled).toEqual([])
  })
  it('адрес — только если у персоны он пустой', () => {
    expect(computeFill({ ...base, address: {} }, { address: { city: 'Haifa' } }).patch.address).toEqual({ city: 'Haifa' })
    expect(computeFill({ ...base, address: { city: '' } }, { address: { city: 'Haifa' } }).filled).toContain('address')
    expect(computeFill({ ...base, address: { city: 'Tel Aviv' } }, { address: { city: 'Haifa' } }).filled).not.toContain('address')
    expect(computeFill(base, { address: { city: '' } }).filled).not.toContain('address')
  })
  it('телефоны: дописывает только новые, формат строк сохраняется', () => {
    const { patch, filled } = computeFill(base, { phones: ['+972-50-123-4567', '0529999999', '0529999999'] })
    expect(patch.phones).toEqual(['0501234567', '0529999999'])
    expect(filled).toEqual(['phones'])
  })
  it('телефоны: формат объектов сохраняется', () => {
    const existing = { ...base, phones: [{ type: 'home', number: '0501234567' }] }
    expect(computeFill(existing, { phones: ['0529999999'] }).patch.phones)
      .toEqual([{ type: 'home', number: '0501234567' }, { type: 'mobile', number: '0529999999' }])
  })
  it('телефон уже есть — ничего не меняется', () => {
    expect(computeFill(base, { phones: ['050-1234567'] })).toEqual({ patch: {}, filled: [] })
  })
})

describe('isEmptyAddress', () => {
  it('null/не объект/пустые значения — пусто', () => {
    expect(isEmptyAddress(null)).toBe(true)
    expect(isEmptyAddress('x')).toBe(true)
    expect(isEmptyAddress({ city: ' ', street: null })).toBe(true)
    expect(isEmptyAddress({ city: 'Haifa' })).toBe(false)
  })
})
