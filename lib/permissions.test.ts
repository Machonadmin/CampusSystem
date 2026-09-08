import { describe, it, expect } from 'vitest'
import { hasFeatureAccess, type FeatureAccess } from './permissions'

// Гейт фич внутри модуля (quality_control.planned.can_view и т.п.).
// Ошибка здесь либо прячет разрешённый экран, либо показывает запрещённый.
const access: FeatureAccess = {
  quality_control: {
    planned: { can_view: true, can_create: true, can_edit: false, can_delete: false },
    history: { can_view: false, can_create: false, can_edit: false, can_delete: false },
  },
}

describe('hasFeatureAccess', () => {
  it('читает конкретное действие, по умолчанию can_view', () => {
    expect(hasFeatureAccess(access, 'quality_control', 'planned')).toBe(true)
    expect(hasFeatureAccess(access, 'quality_control', 'planned', 'can_create')).toBe(true)
    expect(hasFeatureAccess(access, 'quality_control', 'planned', 'can_edit')).toBe(false)
    expect(hasFeatureAccess(access, 'quality_control', 'planned', 'can_delete')).toBe(false)
    expect(hasFeatureAccess(access, 'quality_control', 'history')).toBe(false)
  })

  it('fail-closed: неизвестный модуль/фича/undefined — доступа нет', () => {
    expect(hasFeatureAccess(access, 'finance', 'planned')).toBe(false)
    expect(hasFeatureAccess(access, 'quality_control', 'templates')).toBe(false)
    expect(hasFeatureAccess(undefined, 'quality_control', 'planned')).toBe(false)
    expect(hasFeatureAccess({}, 'quality_control', 'planned')).toBe(false)
  })

  it('fail-closed: отсутствующий флаг действия трактуется как запрет', () => {
    // Такой объект приходит от API старой версии — без новых флагов.
    const partial = { m: { f: { can_view: true } } } as unknown as FeatureAccess
    expect(hasFeatureAccess(partial, 'm', 'f')).toBe(true)
    expect(hasFeatureAccess(partial, 'm', 'f', 'can_delete')).toBe(false)
  })
})
