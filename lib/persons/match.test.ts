import { describe, it, expect } from 'vitest'
import {
  classifyPersonMatch, escapeIlike, findPersonCandidates, namesMatch, recordPhoneKey,
  type PersonCandidate, type PersonCandidateRow,
} from './match'
import { isOrganizationRecord, isPersonLinkAction } from './record-link'
import { maskPhone } from './redact'

function person(over: Partial<PersonCandidateRow> & { id: string }): PersonCandidateRow {
  return {
    first_name: null, last_name: null, middle_name: null, full_name: null,
    hebrew_name: null, email: null, phones: [], ...over,
  }
}
function cand(over: Partial<PersonCandidate> & { id: string }): PersonCandidate {
  return { ...person(over), matched_email: false, matched_phone: false, ...over }
}

describe('namesMatch', () => {
  const p = person({ id: 'p1', last_name: 'Петров', first_name: 'Иван', full_name: 'Петров Иван' })

  it('совпадает без учёта регистра и лишних пробелов', () => {
    expect(namesMatch('  петров   ИВАН ', p)).toBe(true)
  })
  it('совпадает без учёта порядка слов', () => {
    expect(namesMatch('Иван Петров', p)).toBe(true)
  })
  it('совпадает с hebrew_name', () => {
    expect(namesMatch('יוסי כהן', person({ id: 'p2', first_name: 'Yossi', hebrew_name: 'יוסי כהן' }))).toBe(true)
  })
  it('другое имя — не совпадает', () => {
    expect(namesMatch('Иван Сидоров', p)).toBe(false)
  })
  it('пустое имя записи — не совпадает', () => {
    expect(namesMatch('', p)).toBe(false)
    expect(namesMatch(null, p)).toBe(false)
  })
})

describe('classifyPersonMatch', () => {
  const input = { name: 'Иван Петров', email: 'ivan@x.com', phone: '050-123-4567' }

  it('нет кандидатов → none (создать персону)', () => {
    expect(classifyPersonMatch(input, [])).toEqual({ kind: 'none' })
  })
  it('1 кандидат по телефону/email + имя совпало → linked', () => {
    const c = cand({ id: 'p1', first_name: 'Иван', last_name: 'Петров', matched_phone: true })
    expect(classifyPersonMatch(input, [c])).toEqual({ kind: 'linked', person_id: 'p1' })
  })
  it('1 кандидат, имя отличается → suggested', () => {
    const c = cand({ id: 'p1', first_name: 'Мария', matched_email: true })
    expect(classifyPersonMatch(input, [c])).toEqual({ kind: 'suggested', person_id: 'p1' })
  })
  it('несколько кандидатов → suggested, даже если у одного совпало имя', () => {
    const a = cand({ id: 'a', first_name: 'Мария', matched_email: true, matched_phone: true })
    const b = cand({ id: 'b', first_name: 'Иван', last_name: 'Петров', matched_phone: true })
    expect(classifyPersonMatch(input, [a, b])).toEqual({ kind: 'suggested', person_id: 'b' })
  })
  it('несколько кандидатов без совпадения имени → лучший по email+телефону', () => {
    const a = cand({ id: 'a', first_name: 'X', matched_phone: true })
    const b = cand({ id: 'b', first_name: 'Y', matched_email: true, matched_phone: true })
    expect(classifyPersonMatch(input, [a, b])).toEqual({ kind: 'suggested', person_id: 'b' })
  })
  it('при равенстве — первый по порядку', () => {
    const a = cand({ id: 'a', first_name: 'X', matched_phone: true })
    const b = cand({ id: 'b', first_name: 'Y', matched_phone: true })
    expect(classifyPersonMatch(input, [a, b])).toEqual({ kind: 'suggested', person_id: 'a' })
  })
})

describe('recordPhoneKey / escapeIlike / maskPhone', () => {
  it('телефон → последние 9 цифр (как phoneMatchKeys)', () => {
    expect(recordPhoneKey('+972 50-123-4567')).toBe('501234567')
    expect(recordPhoneKey('050-123-4567')).toBe('501234567')
  })
  it('короткий/пустой телефон → null', () => {
    expect(recordPhoneKey('123')).toBeNull()
    expect(recordPhoneKey(null)).toBeNull()
    expect(recordPhoneKey('')).toBeNull()
  })
  it('escapeIlike экранирует % _ \\', () => {
    expect(escapeIlike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d')
  })
  it('maskPhone оставляет только 3 последние цифры', () => {
    expect(maskPhone('050-123-4567')).toBe('*******567')
    expect(maskPhone('1234')).toBe('*234')
    expect(maskPhone('12')).toBeNull()
    expect(maskPhone(null)).toBeNull()
  })
})

describe('isOrganizationRecord / isPersonLinkAction', () => {
  it('contacts: organization — организация, person — нет', () => {
    expect(isOrganizationRecord('contacts', 'organization')).toBe(true)
    expect(isOrganizationRecord('contacts', 'person')).toBe(false)
  })
  it('sponsors: всё кроме individual — организация', () => {
    expect(isOrganizationRecord('sponsors', 'individual')).toBe(false)
    expect(isOrganizationRecord('sponsors', 'organization')).toBe(true)
    expect(isOrganizationRecord('sponsors', 'foundation')).toBe(true)
  })
  it('допустимые действия', () => {
    expect(isPersonLinkAction('confirm')).toBe(true)
    expect(isPersonLinkAction('reject')).toBe(true)
    expect(isPersonLinkAction('unlink')).toBe(true)
    expect(isPersonLinkAction('delete')).toBe(false)
    expect(isPersonLinkAction(undefined)).toBe(false)
  })
})

// ── findPersonCandidates на фейковом клиенте ────────────────────────────────

function fakeSb(rows: PersonCandidateRow[], opts: { error?: { code: string } } = {}) {
  const calls: Array<{ ilike?: [string, string] }> = []
  const sb = {
    from(table: string) {
      expect(table).toBe('persons')
      const call: { ilike?: [string, string] } = {}
      calls.push(call)
      const builder = {
        select() { return builder },
        ilike(col: string, v: string) { call.ilike = [col, v]; return builder },
        limit() {
          if (opts.error) return Promise.resolve({ data: null, error: opts.error })
          // ilike: грубая эмуляция — сравнение без регистра после снятия экранирования.
          const data = call.ilike
            ? rows.filter(r => (r.email ?? '').toLowerCase() === call.ilike![1].replace(/\\(.)/g, '$1'))
            : rows
          return Promise.resolve({ data, error: null })
        },
      }
      return builder
    },
  }
  return { sb: sb as never, calls }
}

describe('findPersonCandidates', () => {
  const rows = [
    person({ id: 'e', first_name: 'A', email: 'Ivan@X.com' }),
    person({ id: 'ph', first_name: 'B', phones: [{ type: 'mobile', number: '+972501234567' }] }),
    person({ id: 'both', first_name: 'C', email: 'ivan@x.com', phones: ['0501234567'] }),
    person({ id: 'none', first_name: 'D', email: 'other@x.com', phones: ['0529999999'] }),
  ]

  it('собирает кандидатов по email и телефону, с флагами совпадения', async () => {
    const { sb } = fakeSb(rows)
    const { candidates, error } = await findPersonCandidates(sb, { name: 'x', email: ' IVAN@x.com ', phone: '050-123-4567' })
    expect(error).toBeNull()
    const byId = Object.fromEntries(candidates.map(c => [c.id, c]))
    expect(Object.keys(byId).sort()).toEqual(['both', 'e', 'ph'])
    expect(byId.e).toMatchObject({ matched_email: true, matched_phone: false })
    expect(byId.ph).toMatchObject({ matched_email: false, matched_phone: true })
    expect(byId.both).toMatchObject({ matched_email: true, matched_phone: true })
  })

  it('без email и телефона — к БД не ходит, кандидатов нет', async () => {
    const { sb, calls } = fakeSb(rows)
    const { candidates } = await findPersonCandidates(sb, { name: 'x', email: null, phone: null })
    expect(candidates).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('ошибка БД пробрасывается в { error }', async () => {
    const { sb } = fakeSb(rows, { error: { code: '42501' } })
    const { candidates, error } = await findPersonCandidates(sb, { name: 'x', email: 'a@b.c', phone: null })
    expect(candidates).toEqual([])
    expect(error).toEqual({ code: '42501' })
  })
})
