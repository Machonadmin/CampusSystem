import { describe, it, expect } from 'vitest'
import { roleLabel } from './role-label'

// Системная роль показывается на языке интерфейса; кастомная (созданная в UI,
// её кода нет в словаре) — под сохранённым в БД именем. Пустая строка на экране
// вместо названия роли — заметный регресс, поэтому фолбэки закреплены тестом.
const map = { superadmin: 'מנהל על', teacher: 'מורה' }

describe('roleLabel', () => {
  it('переводит известный код', () => {
    expect(roleLabel(map, 'superadmin')).toBe('מנהל על')
    expect(roleLabel(map, 'teacher', 'Преподаватель')).toBe('מורה')   // словарь важнее имени из БД
  })
  it('неизвестный код — имя из БД', () => {
    expect(roleLabel(map, 'librarian', 'Библиотекарь')).toBe('Библиотекарь')
  })
  it('неизвестный код без имени — сам код (никогда не пусто)', () => {
    expect(roleLabel(map, 'librarian')).toBe('librarian')
    expect(roleLabel(map, 'librarian', '   ')).toBe('librarian')   // пробельное имя не считается
    expect(roleLabel(map, 'librarian', null)).toBe('librarian')
  })
  it('нет ни кода, ни имени — пустая строка, а не "undefined"', () => {
    expect(roleLabel(map, null)).toBe('')
    expect(roleLabel(map, undefined)).toBe('')
    expect(roleLabel(map, '')).toBe('')
    expect(roleLabel({}, null, null)).toBe('')
  })
  it('без кода, но с именем — имя', () => {
    expect(roleLabel(map, null, 'Библиотекарь')).toBe('Библиотекарь')
  })
})
