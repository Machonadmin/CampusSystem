import { describe, it, expect } from 'vitest'
import ru from '@/messages/ru.json'
import he from '@/messages/he.json'
import en from '@/messages/en.json'

// Регрессионный тест паритета переводов (класс G харденинга). Три файла
// messages/*.json обязаны иметь ОДИНАКОВЫЙ набор ключей: любой ключ,
// присутствующий только в одном языке, — молчаливый баг (пользователь видит
// сырой ключ/фолбэк). useTranslations читает именно эти JSON, поэтому дрейф
// ключей здесь ничем не ловится, кроме такого теста.

type AnyRecord = Record<string, unknown>

function flatten(obj: AnyRecord, prefix = '', out: Set<string> = new Set()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as AnyRecord, key, out)
    else out.add(key)
  }
  return out
}

const kru = flatten(ru as AnyRecord)
const khe = flatten(he as AnyRecord)
const ken = flatten(en as AnyRecord)

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter(k => !b.has(k)).sort()
}

describe('messages/*.json key parity (ru/he/en)', () => {
  it('ru and he have identical key sets', () => {
    expect(diff(kru, khe)).toEqual([])
    expect(diff(khe, kru)).toEqual([])
  })

  it('ru and en have identical key sets', () => {
    expect(diff(kru, ken)).toEqual([])
    expect(diff(ken, kru)).toEqual([])
  })

  it('all three files have the same total key count', () => {
    expect(khe.size).toBe(kru.size)
    expect(ken.size).toBe(kru.size)
  })

  // Ключи, использованные в UI, но отсутствовавшие во всех трёх файлах до
  // харденинга; добавлены сюда, чтобы регресс не удалил их снова.
  it('contains keys that were missing before the hardening sweep', () => {
    for (const keys of [kru, khe, ken]) {
      expect(keys.has('quality.templates.saving')).toBe(true)
      expect(keys.has('settings.roles.error')).toBe(true)
    }
  })
})
