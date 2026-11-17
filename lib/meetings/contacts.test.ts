import { describe, it, expect } from 'vitest'
import {
  addressBookRole, groupsFor, sensitiveAccess, privateAccess, cleanTechPatch, cleanPrivateContact,
  cleanPrivatePatch, replaceFirstPhone, parseCsv, contactsFromTable,
} from './contacts'

describe('ספר אנשי קשר: кто что видит', () => {
  it('המנהל — superadmin или владелец с секретарём; מזכירת המנהל — ведёт чужой календарь', () => {
    expect(addressBookRole({ isSuperadmin: true, hasDelegates: false, managesOthers: false })).toBe('director')
    expect(addressBookRole({ isSuperadmin: false, hasDelegates: true, managesOthers: false })).toBe('director')
    expect(addressBookRole({ isSuperadmin: false, hasDelegates: false, managesOthers: true })).toBe('secretary')
    expect(addressBookRole({ isSuperadmin: false, hasDelegates: false, managesOthers: false })).toBeNull()
  })

  it('без роли, но с расшаренными контактами — только личные', () => {
    expect(groupsFor(null, 0)).toEqual([])
    expect(groupsFor(null, 2)).toEqual(['private'])
    expect(groupsFor('secretary', 0)).toEqual(['students', 'staff', 'alumni', 'donors', 'private'])
  })

  it('секретарь не видит ни встреч, ни заметок; заметки/תרומות — только superadmin', () => {
    expect(sensitiveAccess('secretary', false)).toEqual({ meetings: false, notes: false })
    expect(sensitiveAccess('secretary', true)).toEqual({ meetings: false, notes: false })
    expect(sensitiveAccess('director', false)).toEqual({ meetings: true, notes: false })
    expect(sensitiveAccess('director', true)).toEqual({ meetings: true, notes: true })
  })

  it('личный контакт: владелец, тот с кем поделились, остальные — нет', () => {
    expect(privateAccess('me', 'me', [])).toBe('owner')
    expect(privateAccess('boss', 'me', ['me'])).toBe('shared')
    expect(privateAccess('boss', 'me', ['other'])).toBeNull()
  })
})

describe('ввод', () => {
  it('технические поля: только переданные; пустое имя и кривой email — ошибка', () => {
    expect(cleanTechPatch({ phone: ' 050 ', city: '' })).toEqual({ ok: true, patch: { phone: '050', city: null } })
    expect(cleanTechPatch({ name: '  ' }).ok).toBe(false)
    expect(cleanTechPatch({ email: 'x' }).ok).toBe(false)
    expect(cleanTechPatch({ email: 'a@b.co' })).toEqual({ ok: true, patch: { email: 'a@b.co' } })
    expect(cleanTechPatch({ notes: 'игнор' })).toEqual({ ok: true, patch: {} })
  })

  it('личный контакт: имя обязательно, кривой email при импорте просто не сохраняется', () => {
    expect(cleanPrivateContact({ full_name: '' })).toBeNull()
    expect(cleanPrivateContact({ full_name: 'דוד', email: 'nope' })?.email).toBeNull()
    expect(cleanPrivateContact({ full_name: 'דוד', phone: 5 })).toBeNull()
    expect(cleanPrivatePatch({ email: 'nope' }).ok).toBe(false)
  })

  it('телефон: заменить первый номер, остальные сохранить', () => {
    expect(replaceFirstPhone(null, '050')).toEqual([{ type: 'mobile', number: '050' }])
    expect(replaceFirstPhone([{ type: 'home', number: '1' }, '2'], '9')).toEqual([{ type: 'home', number: '9' }, '2'])
    expect(replaceFirstPhone(['1', '2'], '9')).toEqual([{ type: 'mobile', number: '9' }, '2'])
    expect(replaceFirstPhone(['1', '2'], null)).toEqual(['2'])
  })
})

describe('импорт из таблицы', () => {
  it('CSV с кавычками, запятыми внутри и BOM', () => {
    expect(parseCsv('﻿שם,הערות\r\n"כהן, דוד","אמר ""שלום"""\n\n')).toEqual([['שם', 'הערות'], ['כהן, דוד', 'אמר "שלום"']])
  })

  it('разделитель — таб или точка с запятой', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('заголовки на иврите/английском, שם פרטי + שם משפחה, строки без имени пропускаются', () => {
    const r = contactsFromTable([
      ['שם פרטי', 'שם משפחה', 'טלפון', 'Email', 'קבוצה', 'עמודה לא מוכרת'],
      ['דוד', 'כהן', '050-1', 'd@x.co', 'תורם', 'x'],
      ['', '', '052', '', '', ''],
    ])
    expect(r.recognized).toBe(true)
    expect(r.skipped).toBe(1)
    expect(r.rows).toEqual([{
      full_name: 'דוד כהן', phone: '050-1', email: 'd@x.co', city: null, organization: null, role_title: null, category: 'תורם', notes: null,
    }])
  })

  it('без колонки имени — ничего не импортируем', () => {
    expect(contactsFromTable([['טלפון'], ['050']])).toEqual({ rows: [], skipped: 1, recognized: false })
  })
})
