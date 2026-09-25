import { describe, it, expect } from 'vitest'
import {
  studentStatusSummary,
  financeSummary,
  occupancySummary,
  maintenanceSummary,
  clinicSummary,
  counselingSummary,
  foodSummary,
  financeTotalsFromMaps,
  maintenanceTicketStats,
  aggregateOccupancy,
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
      discounts: 0,
      collected: 750,
      outstanding: 250,
      collection_rate: 75,
      debtor_count: 3,
    })
  })

  it('скидки уменьшают outstanding, но не collection_rate (gross)', () => {
    // 1000 начислено, 200 скидка, 500 собрано → долг 1000−200−500 = 300;
    // collection_rate = 500/1000 = 50% (по gross-начислениям, без скидок).
    const r = financeSummary(100_000, 50_000, 2, 20_000)
    expect(r).toEqual({
      charged: 1000,
      discounts: 200,
      collected: 500,
      outstanding: 300,
      collection_rate: 50,
      debtor_count: 2,
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

// ─── Домены, добавленные при завершении дашборда (documents/sponsors/security) ──

import {
  documentsSummary,
  sponsorsSummary,
  securitySummary,
} from './summaries'

describe('documentsSummary', () => {
  const T = '2026-07-08'
  it('считает активные, просроченные и истекающие', () => {
    const s = documentsSummary(
      [
        { doc_type: 'visa', status: 'active', expiry_date: '2026-06-01' }, // expired
        { doc_type: 'id_card', status: 'active', expiry_date: '2026-07-20' }, // expiring soon
        { doc_type: 'id_card', status: 'active', expiry_date: '2027-01-01' }, // fine
        { doc_type: 'certificate', status: 'archived', expiry_date: '2020-01-01' }, // archived, ignored
      ],
      T,
    )
    expect(s).toEqual({ total: 4, active: 3, expired: 1, expiring_soon: 1 })
  })
  it('пустой список → нули', () => {
    expect(documentsSummary([], T)).toEqual({ total: 0, active: 0, expired: 0, expiring_soon: 0 })
  })
})

describe('sponsorsSummary', () => {
  it('суммирует received/pledged в валюте без float-дрейфа', () => {
    const s = sponsorsSummary(
      [
        { amount: '0.10', status: 'received' },
        { amount: '0.20', status: 'received' },
        { amount: '100', status: 'pledged' },
        { amount: '5', status: 'cancelled' },
      ],
      7,
    )
    expect(s).toEqual({ sponsor_count: 7, total_received: 0.3, total_pledged: 100 })
  })
  it('пустой список → нули, но число доноров сохраняется', () => {
    expect(sponsorsSummary([], 3)).toEqual({ sponsor_count: 3, total_received: 0, total_pledged: 0 })
  })
})

describe('securitySummary', () => {
  it('активные = open + investigating, плюс разбивка по серьёзности', () => {
    const s = securitySummary([
      { status: 'open', severity: 'critical' },
      { status: 'investigating', severity: 'high' },
      { status: 'resolved', severity: 'low' },
      { status: 'closed', severity: 'low' },
    ])
    expect(s.active).toBe(2)
    expect(s.open).toBe(1)
    expect(s.investigating).toBe(1)
    expect(s.by_severity).toEqual({ critical: 1, high: 1, low: 2 })
  })
  it('пустой список → нули и {}', () => {
    expect(securitySummary([])).toEqual({ active: 0, open: 0, investigating: 0, by_severity: {} })
  })
})

// ─── Единый источник: чистые агрегаторы для lib/reports/metrics ─────────────

describe('financeTotalsFromMaps', () => {
  it('пусто → нули', () => {
    expect(financeTotalsFromMaps(new Map(), new Map(), new Map())).toEqual({
      chargesCents: 0, paymentsCents: 0, discountsCents: 0, debtorCount: 0,
    })
  })

  it('суммы и должники с учётом скидок; переплата и «только платёж» — не должники', () => {
    const charges = new Map([['a', 10000], ['b', 5000], ['c', 3000]])
    const pays = new Map([['a', 4000], ['b', 6000], ['d', 1000]])
    const discounts = new Map([['c', 3000]]) // скидка обнуляет долг c
    const r = financeTotalsFromMaps(charges, pays, discounts)
    expect(r.chargesCents).toBe(18000)
    expect(r.paymentsCents).toBe(11000)
    expect(r.discountsCents).toBe(3000)
    expect(r.debtorCount).toBe(1) // только a (10000 − 4000 > 0)
  })

  it('вместе с financeSummary: outstanding может быть отрицательным (переплата)', () => {
    const t = financeTotalsFromMaps(new Map([['a', 1000]]), new Map([['a', 1500]]), new Map())
    const s = financeSummary(t.chargesCents, t.paymentsCents, t.debtorCount, t.discountsCents)
    expect(s.outstanding).toBe(-5)
    expect(s.debtor_count).toBe(0)
  })
})

describe('maintenanceTicketStats', () => {
  const NOW = '2026-07-07T12:00:00.000Z'
  it('status_counts / total / total_overdue согласованы с summary', () => {
    const tickets = [
      { status: 'open', priority: 'urgent', reported_at: '2026-07-07T00:00:00.000Z' }, // 12ч > 4ч → просрочена
      { status: 'in_progress', priority: 'low', reported_at: '2026-07-07T00:00:00.000Z' },
      { status: 'closed', priority: 'urgent', reported_at: '2026-01-01T00:00:00.000Z' },
    ]
    const r = maintenanceTicketStats(tickets, NOW)
    expect(r.total).toBe(3)
    expect(r.status_counts).toEqual({ open: 1, in_progress: 1, closed: 1 })
    expect(r.total_overdue).toBe(1)
    expect(r.summary.overdue).toBe(r.total_overdue)
    expect(r.summary.open).toBe(1)
    expect(r.summary.in_progress).toBe(1)
  })
})

describe('aggregateOccupancy', () => {
  it('по зданиям + итог = сумма зданий; комнаты чужих зданий игнорируются', () => {
    const rooms = [
      { id: 'r1', building_id: 'b1', capacity: 2 },
      { id: 'r2', building_id: 'b1', capacity: 3 },
      { id: 'r3', building_id: 'b2', capacity: 1 },
      { id: 'rx', building_id: 'gone', capacity: 10 },
    ]
    const asg = new Map([
      ['r1', [
        { assigned_from: '2026-01-01', assigned_to: null, status: 'active' },
        { assigned_from: '2026-01-01', assigned_to: '2026-02-01', status: 'active' }, // закончилось
      ]],
      ['r3', [
        { assigned_from: '2026-07-01', assigned_to: null, status: 'active' },
        { assigned_from: '2026-07-01', assigned_to: null, status: 'active' }, // переполнение
      ]],
      ['rx', [{ assigned_from: '2026-01-01', assigned_to: null, status: 'active' }]],
    ])
    const r = aggregateOccupancy(['b1', 'b2', 'b3'], rooms, asg, TODAY)
    expect(r.buildings).toEqual([
      { building_id: 'b1', rooms_count: 2, total_capacity: 5, occupied: 1, free: 4 },
      { building_id: 'b2', rooms_count: 1, total_capacity: 1, occupied: 2, free: 0 },
      { building_id: 'b3', rooms_count: 0, total_capacity: 0, occupied: 0, free: 0 },
    ])
    expect(r.total).toEqual({
      capacity: 6, occupied: 3, free: 3, occupancy_percent: 50, building_count: 3, room_count: 3,
    })
  })

  it('нет зданий → нули', () => {
    expect(aggregateOccupancy([], [], new Map(), TODAY).total).toEqual({
      capacity: 0, occupied: 0, free: 0, occupancy_percent: 0, building_count: 0, room_count: 0,
    })
  })
})
