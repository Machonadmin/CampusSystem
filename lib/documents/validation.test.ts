import { describe, it, expect } from 'vitest'
import {
  isDocType, isDocStatus, isDocCategory, isReviewStatus,
  DOC_TYPES, DOC_STATUSES, DOC_CATEGORIES, REVIEW_STATUSES,
} from './validation'

// Type-guards возвращают 400 ДО обращения к БД, вместо 23514 → 500.
const guards = [
  ['isDocType', isDocType, DOC_TYPES],
  ['isDocStatus', isDocStatus, DOC_STATUSES],
  ['isDocCategory', isDocCategory, DOC_CATEGORIES],
  ['isReviewStatus', isReviewStatus, REVIEW_STATUSES],
] as const

describe('валидация документов', () => {
  for (const [name, guard, values] of guards) {
    it(`${name}: принимает все допустимые значения и ничего лишнего`, () => {
      for (const v of values) expect(guard(v), v).toBe(true)
      for (const v of ['', 'OTHER', 'Other', ' other', 'nope', null, undefined, 0, 1, {}, [], true]) {
        expect(guard(v), `${name}(${JSON.stringify(v)})`).toBe(false)
      }
    })
  }
  it('перечисления не пересекаются между собой (иначе гейты можно перепутать)', () => {
    expect(isDocType('active')).toBe(false)        // статус — не тип
    expect(isDocStatus('passport')).toBe(false)    // тип — не статус
    expect(isDocCategory('received')).toBe(false)  // статус проверки — не категория
    expect(isReviewStatus('general')).toBe(false)  // категория — не статус проверки
  })
})
