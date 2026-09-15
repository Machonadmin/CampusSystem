import { describe, it, expect } from 'vitest'
import { parseOptionalUuid, effectiveTeacherIds } from './slot-fields'

const UUID = '11111111-2222-4333-8444-555555555555'

describe('parseOptionalUuid', () => {
  it('поле не прислано — колонку не трогаем', () => {
    expect(parseOptionalUuid(undefined)).toEqual({ ok: true, provided: false })
  })
  it('null и пустая строка — очистить (наследовать от группы)', () => {
    expect(parseOptionalUuid(null)).toEqual({ ok: true, provided: true, value: null })
    expect(parseOptionalUuid('')).toEqual({ ok: true, provided: true, value: null })
    expect(parseOptionalUuid('   ')).toEqual({ ok: true, provided: true, value: null })
  })
  it('корректный uuid проходит и обрезается по краям', () => {
    expect(parseOptionalUuid(UUID)).toEqual({ ok: true, provided: true, value: UUID })
    expect(parseOptionalUuid(` ${UUID} `)).toEqual({ ok: true, provided: true, value: UUID })
  })
  it('регистр букв не важен', () => {
    expect(parseOptionalUuid(UUID.toUpperCase())).toMatchObject({ ok: true, provided: true })
  })
  it('мусор отвергается ДО обращения к БД (иначе был бы 22P02)', () => {
    for (const bad of ['not-a-uuid', '123', '11111111-2222-4333-8444', 42, {}, [], true]) {
      expect(parseOptionalUuid(bad), String(bad)).toEqual({ ok: false })
    }
  })
})

describe('effectiveTeacherIds', () => {
  it('у слота есть свой преподаватель — только он', () => {
    expect(effectiveTeacherIds('t-own', ['t1', 't2'])).toEqual(['t-own'])
  })
  it('нет своего — наследуем весь список группы', () => {
    expect(effectiveTeacherIds(null, ['t1', 't2'])).toEqual(['t1', 't2'])
    expect(effectiveTeacherIds(undefined, ['t1'])).toEqual(['t1'])
  })
  it('нет ни своего, ни группового — пусто', () => {
    expect(effectiveTeacherIds(null, [])).toEqual([])
  })
  it('возвращает копию — вызывающий не может испортить исходный список группы', () => {
    const group = ['t1']
    const out = effectiveTeacherIds(null, group)
    out.push('t2')
    expect(group).toEqual(['t1'])
  })
})
