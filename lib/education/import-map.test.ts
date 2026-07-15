import { describe, it, expect } from 'vitest'
import { parseFlexibleDate, splitFullName, normalizeGender, phoneDigits, dedupeKey, guessField } from './import-map'

describe('parseFlexibleDate', () => {
  it('ДД.ММ.ГГГГ', () => expect(parseFlexibleDate('07.03.2004')).toBe('2004-03-07'))
  it('ДД/ММ/ГГГГ', () => expect(parseFlexibleDate('7/3/2004')).toBe('2004-03-07'))
  it('ISO как есть', () => expect(parseFlexibleDate('2004-03-07')).toBe('2004-03-07'))
  it('мусор → null', () => expect(parseFlexibleDate('не дата')).toBeNull())
  it('пусто → null', () => expect(parseFlexibleDate('')).toBeNull())
  it('невалидный месяц → null', () => expect(parseFlexibleDate('07.13.2004')).toBeNull())
})

describe('splitFullName', () => {
  it('Фамилия Имя Отчество', () => {
    expect(splitFullName('Азаряева Раиса Вячеславовна')).toEqual({ last_name: 'Азаряева', first_name: 'Раиса', middle_name: 'Вячеславовна' })
  })
  it('два слова → фамилия + имя', () => {
    expect(splitFullName('Иванова Мария')).toEqual({ last_name: 'Иванова', first_name: 'Мария', middle_name: null })
  })
  it('одно слово → имя', () => {
    expect(splitFullName('Рая')).toEqual({ last_name: null, first_name: 'Рая', middle_name: null })
  })
  it('порядок first-last', () => {
    expect(splitFullName('Maria Ivanova', 'first-last')).toEqual({ first_name: 'Maria', last_name: 'Ivanova', middle_name: null })
  })
})

describe('normalizeGender', () => {
  it('Женщина → female', () => expect(normalizeGender('Женщина')).toBe('female'))
  it('муж → male', () => expect(normalizeGender('муж')).toBe('male'))
  it('пусто → null', () => expect(normalizeGender('')).toBeNull())
})

describe('phoneDigits', () => {
  it('оставляет только цифры', () => expect(phoneDigits('+7(999)123-45-67')).toBe('79991234567'))
})

describe('dedupeKey', () => {
  it('по телефону', () => expect(dedupeKey({ phone: '+7 (999) 123-45-67' })).toBe('p:79991234567'))
  it('по имени+дате если нет телефона', () => {
    expect(dedupeKey({ first_name: 'Рая', last_name: 'Азаряева', birth_date: '2004-03-07' })).toBe('nb:рая азаряева|2004-03-07')
  })
  it('пусто если недостаточно данных', () => expect(dedupeKey({ first_name: 'Рая' })).toBe(''))
})

describe('guessField', () => {
  it('ФИО → full_name', () => expect(guessField('ФИО')).toBe('full_name'))
  it('Еврейское имя → hebrew_name (не first_name)', () => expect(guessField('Еврейское имя')).toBe('hebrew_name'))
  it('Дата рождения → birth_date', () => expect(guessField('Дата рождения')).toBe('birth_date'))
  it('Телефон → phone', () => expect(guessField('Телефон')).toBe('phone'))
  it('Пол → gender', () => expect(guessField('Пол')).toBe('gender'))
  it('неизвестное → null', () => expect(guessField('Бонусный счет')).toBeNull())
})
