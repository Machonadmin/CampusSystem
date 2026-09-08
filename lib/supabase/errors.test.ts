import { describe, it, expect } from 'vitest'
import { isMissingRelation, isMissingTable, isMissingColumn } from './errors'

// Deploy-safe контракт: «таблица/колонка ещё не мигрированы» — это И коды
// Postgres (42P01/42703), И коды PostgREST на hosted Supabase (PGRST205/PGRST204).
// Раньше вторые не распознавались, и все гарды промахивались в проде.
describe('lib/supabase/errors — коды «ещё не мигрировано»', () => {
  it('isMissingTable: 42P01 (Postgres) и PGRST205 (PostgREST)', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ code: '42703' })).toBe(false)
    expect(isMissingTable({ code: 'PGRST204' })).toBe(false)
  })

  it('isMissingColumn: 42703 (Postgres) и PGRST204 (PostgREST)', () => {
    expect(isMissingColumn({ code: '42703' })).toBe(true)
    expect(isMissingColumn({ code: 'PGRST204' })).toBe(true)
    expect(isMissingColumn({ code: '42P01' })).toBe(false)
    expect(isMissingColumn({ code: 'PGRST205' })).toBe(false)
  })

  it('isMissingRelation: все четыре кода', () => {
    for (const code of ['42P01', '42703', 'PGRST205', 'PGRST204']) {
      expect(isMissingRelation({ code }), code).toBe(true)
    }
  })

  it('принимает код строкой (для мест, где код уже извлечён в переменную)', () => {
    expect(isMissingTable('42P01')).toBe(true)
    expect(isMissingTable('PGRST205')).toBe(true)
    expect(isMissingColumn('PGRST204')).toBe(true)
    expect(isMissingRelation('42703')).toBe(true)
    expect(isMissingRelation('23505')).toBe(false)
  })

  it('чужие коды и мусор → false (fail-closed: неизвестная ошибка НЕ считается «не мигрировано»)', () => {
    for (const v of [{ code: '23505' }, { code: '23503' }, { code: 'PGRST200' }, { code: 'PGRST202' }, { code: 'P0002' }, { code: '' }, { code: null }, {}, null, undefined, 42, 'nope', { message: 'x' }]) {
      expect(isMissingRelation(v), JSON.stringify(v)).toBe(false)
      expect(isMissingTable(v), JSON.stringify(v)).toBe(false)
      expect(isMissingColumn(v), JSON.stringify(v)).toBe(false)
    }
  })

  it('объект ошибки Supabase с лишними полями (message/details/hint) распознаётся', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.zz' in the schema cache", details: null, hint: null })).toBe(true)
    expect(isMissingColumn({ code: 'PGRST204', message: "Could not find the 'zz' column of 'class_groups' in the schema cache" })).toBe(true)
  })
})
