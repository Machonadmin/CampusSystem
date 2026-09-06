import { describe, it, expect } from 'vitest'
import {
  parseAuditQuery, buildAuditDiff, isUuid, isIsoDate,
  AUDIT_PAGE_SIZE_DEFAULT, AUDIT_PAGE_SIZE_MAX,
} from './query'

const q = (obj: Record<string, string>) => {
  const p = new URLSearchParams(obj)
  return (k: string) => p.get(k)
}
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('isUuid / isIsoDate', () => {
  it('uuid', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
  it('iso date', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-2-8')).toBe(false)
    expect(isIsoDate('2026-02-31')).toBe(false) // не существует
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
})

describe('parseAuditQuery', () => {
  it('пустой запрос → дефолты без фильтров', () => {
    expect(parseAuditQuery(q({}))).toEqual({
      entityType: null, entityId: null, changedBy: null, action: null,
      from: null, to: null, limit: AUDIT_PAGE_SIZE_DEFAULT, offset: 0,
    })
  })
  it('принимает валидные фильтры', () => {
    const r = parseAuditQuery(q({
      entity_type: 'persons', entity_id: UUID, changed_by: UUID,
      action: 'update', from: '2026-01-01', to: '2026-01-31', limit: '10', offset: '20',
    }))
    expect(r).toEqual({
      entityType: 'persons', entityId: UUID, changedBy: UUID, action: 'update',
      from: '2026-01-01', to: '2026-01-31', limit: 10, offset: 20,
    })
  })
  it('невалидные uuid/дата/action отбрасываются, а не роняют запрос', () => {
    const r = parseAuditQuery(q({ entity_id: 'xx', changed_by: 'yy', action: 'drop', from: 'nope', to: '13-13-13' }))
    expect(r.entityId).toBeNull()
    expect(r.changedBy).toBeNull()
    expect(r.action).toBeNull()
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
  })
  it('limit зажимается в [1, MAX], offset не отрицательный', () => {
    expect(parseAuditQuery(q({ limit: '0' })).limit).toBe(1)
    expect(parseAuditQuery(q({ limit: '9999' })).limit).toBe(AUDIT_PAGE_SIZE_MAX)
    expect(parseAuditQuery(q({ limit: 'abc' })).limit).toBe(AUDIT_PAGE_SIZE_DEFAULT)
    expect(parseAuditQuery(q({ limit: '1.5' })).limit).toBe(AUDIT_PAGE_SIZE_DEFAULT)
    expect(parseAuditQuery(q({ offset: '-5' })).offset).toBe(0)
  })
})

describe('buildAuditDiff', () => {
  it('update: только изменённые поля, до → после', () => {
    expect(buildAuditDiff({
      action: 'update',
      old_data: { full_name: 'A', phone: '1' },
      new_data: { full_name: 'B', phone: '1' },
      changed_fields: ['full_name'],
    })).toEqual([{ field: 'full_name', before: 'A', after: 'B' }])
  })
  it('create: changed_fields пуст → все поля new_data, before=null', () => {
    const d = buildAuditDiff({ action: 'create', old_data: null, new_data: { a: 1, b: 2 }, changed_fields: [] })
    expect(d).toEqual([
      { field: 'a', before: null, after: 1 },
      { field: 'b', before: null, after: 2 },
    ])
  })
  it('delete: все поля old_data, after=null', () => {
    const d = buildAuditDiff({ action: 'delete', old_data: { a: 1 }, new_data: null, changed_fields: null })
    expect(d).toEqual([{ field: 'a', before: 1, after: null }])
  })
  it('устойчив к не-объектам в old_data/new_data', () => {
    expect(buildAuditDiff({ action: 'update', old_data: 'x', new_data: 7, changed_fields: ['f'] }))
      .toEqual([{ field: 'f', before: null, after: null }])
  })
})
