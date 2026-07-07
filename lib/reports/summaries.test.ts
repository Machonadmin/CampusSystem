import { describe, it, expect } from 'vitest'
import {
  studentStatusSummary,
  financeSummary,
  occupancySummary,
  maintenanceSummary,
  clinicSummary,
  counselingSummary,
  foodSummary,
} from './summaries'

const TODAY = '2026-07-07'

// ─── studentStatusSummary ────────────────────────────────────────────────────

describe('studentStatusSummary', () => {
  it('пустой список → total 0, by_status пустой', () => {
    expect(studentStatusSummary([])).toEqual({ total: 0, by_status: {} })
  })

  it('считает total и разбивку по education_status', () => {
    const r = studentStatusSummary([
      { education_status: 'student' },
      { education_status: 'student' },
      { education_status: 'lead' },
      { education_status: 'graduated' },
      { education_status: 'student' },
    ])
    expect(r.total).toBe(5)
    expect(r.by_status).toEqual({ student: 3, lead: 1, graduated: 1 })
  })
})

// ─── financeSummary ──────────────────────────────────────────────────────────

describe('financeSummary', () => {
  it('нормальный случай: рубли из копеек + процент собираемости', () => {
    // 1000.00 начислено, 750.00 собрано → долг 250.00, собираемость 75%
    const r = financeSummary(100_000, 75_000, 3)
    expect(r).toEqual({
      charged: 1000,
      collected: 750,
      outstanding: 250,
      collection_rate: 75,
      debtor_count: 3,
    })
  })

  it('деление на ноль: charged=0 → collection_rate 0', () => {
    const r = financeSummary(0, 0, 0)
    expect(r.charged).toBe(0)
    expect(r.collected).toBe(0)
    expect(r.outstanding).toBe(0)
    expect(r.collection_rate).toBe(0)
    expect(r.debtor_count).toBe(0)
  })

  it('переплата: outstanding может быть отрицательным, rate > 100', () => {
    const r = financeSummary(5_000, 8_000, 0)
    expect(r.charged).toBe(50)
    expect(r.collected).toBe(80)
    expect(r.outstanding).toBe(-30)
    expect(r.collection_rate).toBe(160)
  })

  it('процент округляется до целого', () => {
    // 1/3 → 33.33% → 33
    expect(financeSummary(300, 100, 1).collection_rate).toBe(33)
    // 2/3 → 66.66% → 67
    expect(financeSummary(300, 200, 0).collection_rate).toBe(67)
  })
})

// ─── occupancySummary ────────────────────────────────────────────────────────

describe('occupancySummary', () => {
  it('нормальный случай', () => {
    expect(occupancySummary(10, 7)).toEqual({
      capacity: 10,
      occupied: 7,
      free: 3,
      occupancy_percent: 70,
    })
  })

  it('деление на ноль: capacity=0 → percent 0, free 0', () => {
    expect(occupancySummary(0, 0)).toEqual({
      capacity: 0,
      occupied: 0,
      free: 0,
      occupancy_percent: 0,
    })
  })

  it('переполнение: free не отрицательный, percent > 100', () => {
    expect(occupancySummary(10, 12)).toEqual({
      capacity: 10,
      occupied: 12,
      free: 0,
      occupancy_percent: 120,
    })
  })

  it('процент округляется', () => {
    expect(occupancySummary(3, 1).occupancy_percent).toBe(33)
    expect(occupancySummary(3, 2).occupancy_percent).toBe(67)
  })
})

// ─── maintenanceSummary ──────────────────────────────────────────────────────

describe('maintenanceSummary', () => {
  it('пустой список → нули, все приоритеты по нулям', () => {
    expect(maintenanceSummary([], TODAY)).toEqual({
      open: 0,
      in_progress: 0,
      overdue: 0,
      by_priority: { urgent: 0, high: 0, normal: 0, low: 0 },
    })
  })

  it('считает open / in_progress и просрочку по SLA (reuse isOverdue)', () => {
    const tickets = [
      // open, normal, возраст 144ч > SLA normal(72ч) → просрочен
      { status: 'open', priority: 'normal', reported_at: '2026-07-01T00:00:00Z' },
      // in_progress, low, возраст 144ч < SLA low(168ч) → НЕ просрочен
      { status: 'in_progress', priority: 'low', reported_at: '2026-07-01T00:00:00Z' },
      // closed — в open/in_progress не попадает и не просрочен
      { status: 'closed', priority: 'urgent', reported_at: '2020-01-01T00:00:00Z' },
      // open, urgent, возраст 144ч > SLA urgent(4ч) → просрочен
      { status: 'open', priority: 'urgent', reported_at: '2026-07-01T00:00:00Z' },
    ]
    const r = maintenanceSummary(tickets, TODAY)
    expect(r.open).toBe(2)
    expect(r.in_progress).toBe(1)
    expect(r.overdue).toBe(2)
    // by_priority только по активным (open+in_progress): normal 1, low 1, urgent 1
    expect(r.by_priority).toEqual({ urgent: 1, high: 0, normal: 1, low: 1 })
  })

  it('граница SLA: возраст РОВНО = SLA → НЕ просрочен', () => {
    // normal SLA = 72ч; reported ровно 72ч назад (3 дня)
    const r = maintenanceSummary(
      [{ status: 'open', priority: 'normal', reported_at: '2026-07-04T00:00:00Z' }],
      TODAY,
    )
    expect(r.overdue).toBe(0)
    expect(r.open).toBe(1)
  })

  it('точность SLA в часах: «сейчас» как полный ISO-таймстамп, внутридневная просрочка', () => {
    const now = '2026-07-07T10:00:00Z'
    // urgent SLA=4ч: заявка 8ч назад (02:00Z) → просрочена
    const overdueUrgent = maintenanceSummary(
      [{ status: 'open', priority: 'urgent', reported_at: '2026-07-07T02:00:00Z' }],
      now,
    )
    expect(overdueUrgent.overdue).toBe(1)
    // urgent SLA=4ч: заявка 2ч назад (08:00Z) → ещё НЕ просрочена
    const freshUrgent = maintenanceSummary(
      [{ status: 'open', priority: 'urgent', reported_at: '2026-07-07T08:00:00Z' }],
      now,
    )
    expect(freshUrgent.overdue).toBe(0)
  })

  it('by_priority не считает закрытые/решённые заявки', () => {
    const r = maintenanceSummary(
      [
        { status: 'resolved', priority: 'urgent', reported_at: '2026-07-01T00:00:00Z' },
        { status: 'cancelled', priority: 'high', reported_at: '2026-07-01T00:00:00Z' },
      ],
      TODAY,
    )
    expect(r.by_priority).toEqual({ urgent: 0, high: 0, normal: 0, low: 0 })
    expect(r.open).toBe(0)
    expect(r.in_progress).toBe(0)
  })
})

// ─── clinicSummary ───────────────────────────────────────────────────────────

describe('clinicSummary', () => {
  it('пустой список → нули', () => {
    expect(clinicSummary([], TODAY)).toEqual({
      open_visits: 0,
      upcoming_followups: 0,
      overdue_followups: 0,
    })
  })

  it('граница follow_up == сегодня → предстоящий, НЕ просроченный', () => {
    const r = clinicSummary(
      [{ status: 'open', follow_up_date: TODAY }],
      TODAY,
    )
    expect(r.open_visits).toBe(1)
    expect(r.upcoming_followups).toBe(1)
    expect(r.overdue_followups).toBe(0)
  })

  it('follow_up вчера → просроченный', () => {
    const r = clinicSummary(
      [{ status: 'open', follow_up_date: '2026-07-06' }],
      TODAY,
    )
    expect(r.overdue_followups).toBe(1)
    expect(r.upcoming_followups).toBe(0)
  })

  it('закрытые приёмы не считаются ни как open, ни в контроле', () => {
    const r = clinicSummary(
      [
        { status: 'closed', follow_up_date: '2026-07-06' },
        { status: 'open', follow_up_date: null },
      ],
      TODAY,
    )
    expect(r.open_visits).toBe(1)
    expect(r.upcoming_followups).toBe(0)
    expect(r.overdue_followups).toBe(0)
  })
})

// ─── counselingSummary ───────────────────────────────────────────────────────

describe('counselingSummary', () => {
  it('пустые входы → нули, by_risk пустой', () => {
    expect(counselingSummary([], [], TODAY)).toEqual({
      open_sessions: 0,
      upcoming_followups: 0,
      overdue_followups: 0,
      by_risk: {},
    })
  })

  it('сессии + разбивка профилей по уровню риска', () => {
    const sessions = [
      { status: 'open', follow_up_date: TODAY },       // upcoming (граница)
      { status: 'open', follow_up_date: '2026-07-06' }, // overdue
      { status: 'closed', follow_up_date: '2026-07-06' }, // не считается
    ]
    const profiles = [
      { risk_level: 'high' },
      { risk_level: 'high' },
      { risk_level: 'low' },
      { risk_level: 'none' },
    ]
    const r = counselingSummary(sessions, profiles, TODAY)
    expect(r.open_sessions).toBe(2)
    expect(r.upcoming_followups).toBe(1)
    expect(r.overdue_followups).toBe(1)
    expect(r.by_risk).toEqual({ high: 2, low: 1, none: 1 })
  })
})

// ─── foodSummary ─────────────────────────────────────────────────────────────

describe('foodSummary', () => {
  it('нормальный случай', () => {
    expect(foodSummary(30, 100)).toEqual({ enrolled: 30, unenrolled: 70 })
  })

  it('пусто: 0 из 0', () => {
    expect(foodSummary(0, 0)).toEqual({ enrolled: 0, unenrolled: 0 })
  })

  it('enrolled > total → unenrolled не отрицательный (clamp 0)', () => {
    expect(foodSummary(120, 100)).toEqual({ enrolled: 120, unenrolled: 0 })
  })
})
