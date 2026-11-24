import { describe, it, expect } from 'vitest'
import { parseAlumniInput, parsePhones, mergeAddress } from './input'

describe('parseAlumniInput', () => {
  it('create: требует имя', () => {
    expect(parseAlumniInput({}, 'create')).toEqual({ ok: false, error: 'name_required' })
    expect(parseAlumniInput({ first_name: '  ' }, 'create')).toEqual({ ok: false, error: 'name_required' })
  })

  it('create: нормализует поля', () => {
    const r = parseAlumniInput({
      first_name: ' Мария ', last_name: 'Абрамова', middle_name: '', hebrew_name: 'Мазаля',
      birth_date: '2003-09-12', email: '', phones: '+7 900, +7 901',
      country: 'РФ', city: 'Пятигорск', graduation_year: '2022', direction: 'Колледж',
    }, 'create')
    expect(r).toEqual({
      ok: true,
      person: {
        first_name: 'Мария', last_name: 'Абрамова', middle_name: null, hebrew_name: 'Мазаля',
        birth_date: '2003-09-12', email: null,
        phones: [{ type: 'mobile', number: '+7 900' }, { type: 'mobile', number: '+7 901' }],
      },
      address: { country: 'РФ', city: 'Пятигорск' },
      profile: { graduation_year: 2022, direction: 'Колледж' },
      journey: {},
    })
  })

  it('update: только присланные поля', () => {
    const r = parseAlumniInput({ current_occupation: 'Учитель' }, 'update')
    expect(r).toEqual({ ok: true, person: {}, address: null, profile: { current_occupation: 'Учитель' }, journey: {} })
  })

  it('update: пустое имя запрещено, если прислано', () => {
    expect(parseAlumniInput({ first_name: '' }, 'update')).toEqual({ ok: false, error: 'name_required' })
  })

  it('отклоняет неверные дату, год и email', () => {
    expect(parseAlumniInput({ first_name: 'A', birth_date: '12.09.2003' }, 'create')).toMatchObject({ ok: false, error: 'invalid_date' })
    expect(parseAlumniInput({ first_name: 'A', birth_date: '2003-02-30' }, 'create')).toMatchObject({ ok: false, error: 'invalid_date' })
    expect(parseAlumniInput({ first_name: 'A', graduation_year: '20x2' }, 'create')).toMatchObject({ ok: false, error: 'invalid_year' })
    expect(parseAlumniInput({ first_name: 'A', email: 'нет' }, 'create')).toMatchObject({ ok: false, error: 'invalid_email' })
  })

  it('год поступления идёт в дело', () => {
    expect(parseAlumniInput({ year_start: '2019' }, 'update')).toMatchObject({ ok: true, journey: { year_start: 2019 } })
    expect(parseAlumniInput({ year_start: 'abc' }, 'update')).toMatchObject({ ok: false, error: 'invalid_year' })
  })

  it('пустой год = null', () => {
    expect(parseAlumniInput({ graduation_year: '' }, 'update')).toMatchObject({ ok: true, profile: { graduation_year: null } })
  })
})

describe('parsePhones', () => {
  it('принимает массив строк/объектов и убирает дубли', () => {
    expect(parsePhones(['1', { number: ' 2 ' }, '1', ''])).toEqual([
      { type: 'mobile', number: '1' }, { type: 'mobile', number: '2' },
    ])
  })
})

describe('mergeAddress', () => {
  it('сохраняет прочие ключи и убирает пустые', () => {
    expect(mergeAddress({ street: 'Ленина', city: 'X' }, { city: 'Y', country: null }))
      .toEqual({ street: 'Ленина', city: 'Y' })
    expect(mergeAddress({ city: 'X' }, { city: null })).toBeNull()
  })
})
