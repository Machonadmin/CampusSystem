import { describe, it, expect } from 'vitest'
import { changedFields } from './edit-patch'

describe('changedFields', () => {
  const initial = { name_he: 'כספים', name_ru: 'Финансы', name_en: 'Finance' }

  it('ничего не меняли — пустой патч, переводы не стираются', () => {
    expect(changedFields(initial, { ...initial })).toEqual({})
  })

  it('в патч попадает только изменённое поле', () => {
    expect(changedFields(initial, { ...initial, name_he: 'כספים חדש' })).toEqual({ name_he: 'כספים חדש' })
  })

  it('очищенное поле — это правка (перевод сознательно убран)', () => {
    expect(changedFields(initial, { ...initial, name_en: '' })).toEqual({ name_en: '' })
  })

  it('пробелы по краям правкой не считаются', () => {
    expect(changedFields(initial, { ...initial, name_ru: ' Финансы  ' })).toEqual({})
  })
})
