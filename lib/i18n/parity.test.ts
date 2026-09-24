import { describe, it, expect } from 'vitest'
import ru from '@/messages/ru.json'
import he from '@/messages/he.json'
import en from '@/messages/en.json'

/**
 * Паритет i18n: ru/he/en ОБЯЗАНЫ иметь идентичный набор ключей. Раньше это
 * проверялось вручную перед каждым PR; теперь это тест — забытый ключ в одном
 * языке валит `npm test` (и CI), а не всплывает как сырой ключ у пользователя.
 *
 * Сравниваем ПЛОСКИЕ пути ключей (a.b.c), а не только верхний уровень.
 */

type Json = Record<string, unknown>

function flatten(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix + k
    return v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Json, path + '.')
      : [path]
  })
}

const keys = {
  ru: new Set(flatten(ru as Json)),
  he: new Set(flatten(he as Json)),
  en: new Set(flatten(en as Json)),
}

function missing(from: Set<string>, reference: Set<string>): string[] {
  return [...reference].filter(k => !from.has(k)).sort()
}

describe('i18n parity (ru / he / en)', () => {
  it('he has every key that ru has', () => {
    expect(missing(keys.he, keys.ru), 'keys present in ru but missing in he').toEqual([])
  })
  it('en has every key that ru has', () => {
    expect(missing(keys.en, keys.ru), 'keys present in ru but missing in en').toEqual([])
  })
  it('ru has every key that he has', () => {
    expect(missing(keys.ru, keys.he), 'keys present in he but missing in ru').toEqual([])
  })
  it('ru has every key that en has', () => {
    expect(missing(keys.ru, keys.en), 'keys present in en but missing in ru').toEqual([])
  })
  it('all three languages have the same number of keys', () => {
    expect({ ru: keys.ru.size, he: keys.he.size, en: keys.en.size })
      .toEqual({ ru: keys.ru.size, he: keys.ru.size, en: keys.ru.size })
  })
})
