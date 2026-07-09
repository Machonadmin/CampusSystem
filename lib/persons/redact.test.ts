import { describe, it, expect } from 'vitest'
import { redactSensitivePerson, SENSITIVE_PERSON_FIELDS } from './redact'

const fullRow = {
  id: 'p1',
  full_name: 'Иван Иванов',
  email: 'ivan@example.com',
  passport_number: 'AA123456',
  address: 'ул. Пример, 1',
  nationality: 'IL',
  marital_status: 'married',
  birth_date: '1990-01-01',
}

describe('redactSensitivePerson', () => {
  it('canSeeSensitive=true → строка возвращается без изменений (та же ссылка)', () => {
    const result = redactSensitivePerson(fullRow, true)
    expect(result).toBe(fullRow)
    expect(result.passport_number).toBe('AA123456')
  })

  it('canSeeSensitive=false → все чувствительные поля обнулены', () => {
    const result = redactSensitivePerson(fullRow, false)
    expect(result.passport_number).toBeNull()
    expect(result.address).toBeNull()
    expect(result.nationality).toBeNull()
    expect(result.marital_status).toBeNull()
    expect(result.birth_date).toBeNull()
  })

  it('нечувствительные поля сохраняются при редакции', () => {
    const result = redactSensitivePerson(fullRow, false)
    expect(result.id).toBe('p1')
    expect(result.full_name).toBe('Иван Иванов')
    expect(result.email).toBe('ivan@example.com')
  })

  it('не мутирует исходный объект', () => {
    const original = { ...fullRow }
    redactSensitivePerson(fullRow, false)
    expect(fullRow).toEqual(original)
  })

  it('обнуляет только присутствующие поля (частичная строка)', () => {
    const partial = { id: 'p2', full_name: 'X', birth_date: '2000-05-05' }
    const result = redactSensitivePerson(partial, false)
    expect(result.birth_date).toBeNull()
    expect(result.full_name).toBe('X')
    expect('passport_number' in result).toBe(false)
  })

  it('каталог чувствительных полей соответствует спецификации', () => {
    expect([...SENSITIVE_PERSON_FIELDS].sort()).toEqual(
      ['address', 'birth_date', 'marital_status', 'nationality', 'passport_number'].sort(),
    )
  })
})
