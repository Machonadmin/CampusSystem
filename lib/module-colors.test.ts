import { describe, it, expect } from 'vitest'
import { isModuleImplemented, getModuleColor, getModuleHeaderGradient } from './module-colors'

describe('isModuleImplemented', () => {
  it('реализованные модули → true', () => {
    for (const m of ['education', 'tasks', 'settings', 'staff', 'quality_control', 'alumni', 'finance', 'dormitory', 'food', 'maintenance', 'doctor', 'psychologist', 'reports', 'documents', 'contacts']) {
      expect(isModuleImplemented(m)).toBe(true)
    }
  })

  it('пока не реализованные модули → false', () => {
    expect(isModuleImplemented('sponsors')).toBe(false)
    expect(isModuleImplemented('nonexistent')).toBe(false)
  })
})

describe('getModuleColor', () => {
  it('возвращает цвет известного модуля', () => {
    expect(getModuleColor('education', 'primary')).toBe('#10B981')
    expect(getModuleColor('finance', 'primary')).toBe('#059669')
  })

  it('primary — значение по умолчанию', () => {
    expect(getModuleColor('education')).toBe('#10B981')
  })

  it('неизвестный модуль → серый fallback, разный для light и остальных', () => {
    expect(getModuleColor('nope')).toBe('#6B7280')
    expect(getModuleColor('nope', 'primary')).toBe('#6B7280')
    expect(getModuleColor('nope', 'light')).toBe('#F3F4F6')
  })
})

describe('getModuleHeaderGradient', () => {
  it('строит linear-gradient из medium и primary', () => {
    expect(getModuleHeaderGradient('education'))
      .toBe('linear-gradient(135deg, #34D399 0%, #10B981 100%)')
  })
})
