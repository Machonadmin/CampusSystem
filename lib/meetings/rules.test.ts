import { describe, it, expect } from 'vitest'
import {
  meetingVisibility, redactMeeting, freeSlots, isoToMinutes, minutesToHHmm,
  canApplyRequestAction, statusAfter, isLocalDateTime, isValidRange, cleanText, isUuid,
  type MeetingRow,
} from './rules'

const row: MeetingRow = {
  id: 'a', provider_id: 'owner', journey_id: null, title: 'נושא',
  reason: 'פירוט', notes: 'הערות', summary: 'סיכום', private_note: 'חסוי', prep_notes: 'הכנה',
  starts_at: '2026-11-17T10:00:00+00:00', ends_at: '2026-11-17T10:30:00+00:00', status: 'scheduled',
}

describe('meetingVisibility', () => {
  it('владелец видит и может всё', () => {
    const v = meetingVisibility({ isOwner: true, isDelegate: false, isContentViewer: false })
    expect(v).toEqual({ basic: true, content: true, prep: true, privateNote: true, manageSchedule: true, manageContent: true })
  })

  it('секретарь по умолчанию: время, участники, тема и подготовка — без содержания', () => {
    const v = meetingVisibility({ isOwner: false, isDelegate: true, isContentViewer: false })
    expect(v.basic).toBe(true)
    expect(v.content).toBe(false)
    expect(v.privateNote).toBe(false)
    expect(v.prep).toBe(true)
    expect(v.manageSchedule).toBe(true)
    expect(v.manageContent).toBe(false)
  })

  it('секретарь, которой открыли содержание, видит его, но не הערה חסויה', () => {
    const v = meetingVisibility({ isOwner: false, isDelegate: true, isContentViewer: true })
    expect(v.content).toBe(true)
    expect(v.privateNote).toBe(false)
    expect(v.manageContent).toBe(false)
  })

  it('открытый содержанию посторонний не видит подготовку и не управляет', () => {
    const v = meetingVisibility({ isOwner: false, isDelegate: false, isContentViewer: true })
    expect(v).toEqual({ basic: true, content: true, prep: false, privateNote: false, manageSchedule: false, manageContent: false })
  })

  it('без связи — ничего', () => {
    expect(meetingVisibility({ isOwner: false, isDelegate: false, isContentViewer: false }).basic).toBe(false)
  })
})

describe('redactMeeting', () => {
  it('секретарю обнуляет содержание и הערה חסויה, оставляет тему, время и подготовку', () => {
    const r = redactMeeting(row, meetingVisibility({ isOwner: false, isDelegate: true, isContentViewer: false }))
    expect(r.title).toBe('נושא')
    expect(r.starts_at).toBe(row.starts_at)
    expect(r.reason).toBeNull()
    expect(r.notes).toBeNull()
    expect(r.summary).toBeNull()
    expect(r.private_note).toBeNull()
    expect(r.prep_notes).toBe('הכנה')
  })

  it('владельцу отдаёт всё', () => {
    expect(redactMeeting(row, meetingVisibility({ isOwner: true, isDelegate: false, isContentViewer: false }))).toEqual(row)
  })

  it('הערה חסויה не уходит никому, кроме владельца, даже с открытым содержанием', () => {
    const r = redactMeeting(row, meetingVisibility({ isOwner: false, isDelegate: true, isContentViewer: true }))
    expect(r.summary).toBe('סיכום')
    expect(r.private_note).toBeNull()
  })
})

describe('freeSlots', () => {
  it('пустой день — одно окно на весь рабочий день', () => {
    expect(freeSlots([])).toEqual([[480, 1200]])
  })

  it('пересекающиеся и неупорядоченные занятые интервалы', () => {
    expect(freeSlots([[600, 660], [540, 610], [900, 960]])).toEqual([[480, 540], [660, 900], [960, 1200]])
  })

  it('окна короче минимума отбрасываются, интервалы за границами дня обрезаются', () => {
    expect(freeSlots([[400, 490], [500, 1300]])).toEqual([])
    expect(freeSlots([[490, 500]], 480, 1200, 15)).toEqual([[500, 1200]])
  })
})

describe('время', () => {
  it('isoToMinutes / minutesToHHmm', () => {
    expect(isoToMinutes('2026-11-17T09:30:00+00:00')).toBe(570)
    expect(isoToMinutes('2026-11-17')).toBeNull()
    expect(minutesToHHmm(570)).toBe('09:30')
  })

  it('isLocalDateTime / isValidRange', () => {
    expect(isLocalDateTime('2026-11-17T09:30')).toBe(true)
    expect(isLocalDateTime('2026-11-17')).toBe(false)
    expect(isValidRange('2026-11-17T09:30', '2026-11-17T10:00')).toBe(true)
    expect(isValidRange('2026-11-17T10:00', '2026-11-17T10:00')).toBe(false)
  })
})

describe('заявки', () => {
  it('закрытую заявку изменить нельзя', () => {
    for (const s of ['approved', 'declined', 'cancelled']) {
      expect(canApplyRequestAction(s, 'approve')).toBe(false)
      expect(canApplyRequestAction(s, 'cancel')).toBe(false)
    }
  })

  it('ответ на предложенное время — только когда время предложено', () => {
    expect(canApplyRequestAction('pending', 'accept_proposal')).toBe(false)
    expect(canApplyRequestAction('proposed', 'accept_proposal')).toBe(true)
    expect(canApplyRequestAction('proposed', 'approve')).toBe(true)
  })

  it('статусы после действий', () => {
    expect(statusAfter('approve')).toBe('approved')
    expect(statusAfter('accept_proposal')).toBe('approved')
    expect(statusAfter('propose')).toBe('proposed')
    expect(statusAfter('decline')).toBe('declined')
    expect(statusAfter('decline_proposal')).toBe('cancelled')
  })
})

describe('ввод', () => {
  it('cleanText', () => {
    expect(cleanText('  x ', 5)).toBe('x')
    expect(cleanText('   ', 5)).toBeNull()
    expect(cleanText(undefined, 5)).toBeNull()
    expect(cleanText('123456', 5)).toBeUndefined()
    expect(cleanText(5, 5)).toBeUndefined()
  })

  it('isUuid', () => {
    expect(isUuid('7d5a545a-5751-49f0-ad48-76dcdf0f9849')).toBe(true)
    expect(isUuid('x')).toBe(false)
  })
})

import { canUseMeetingPeople, meetingPeopleFilter } from './people'

describe('выбор людей', () => {
  it('поиск людей — только superadmin, владелец с секретарём или секретарь', () => {
    expect(canUseMeetingPeople({ isSuperadmin: false, managesOthers: false, hasDelegates: false })).toBe(false)
    expect(canUseMeetingPeople({ isSuperadmin: false, managesOthers: true, hasDelegates: false })).toBe(true)
    expect(canUseMeetingPeople({ isSuperadmin: false, managesOthers: false, hasDelegates: true })).toBe(true)
    expect(canUseMeetingPeople({ isSuperadmin: true, managesOthers: false, hasDelegates: false })).toBe(true)
  })

  it('выбрать можно сотрудника с учётной записью или студентку', () => {
    expect([...meetingPeopleFilter(['a'], ['b', 'a'])].sort()).toEqual(['a', 'b'])
  })
})
