// ─── Модуль «Отчёты / Обзор» — чистые сводки ─────────────────────────────────
//
// READ-ONLY дашборд руководства. Здесь ТОЛЬКО чистые функции: они принимают
// уже вычитанные строки (или уже посчитанные агрегаты) из других модулей и
// возвращают сводные объекты. Никаких обращений к БД и НИКАКИХ вызовов
// Date.now() — «сегодня» всегда передаётся параметром todayISO, поэтому логика
// детерминирована и целиком покрывается юнит-тестами (summaries.test.ts, vitest).
//
// Модуль ПЕРЕИСПОЛЬЗУЕТ чистые хелперы других модулей (импортирует их), но НЕ
// изменяет ни их файлы, ни их таблицы, ни их поведение.

import { centsToNumber } from '@/lib/finance/money'
import { isOverdue, PRIORITY_RANK, statusCounts } from '@/lib/maintenance/tickets'
import { visitStats, type VisitLike } from '@/lib/doctor/medical'
import { sessionStats, type SessionLike } from '@/lib/psychologist/counseling'
import { documentStats, type DocLike } from '@/lib/documents/expiry'
import { donationStats, type DonationStatLike } from '@/lib/sponsors/donations'
import { incidentStats } from '@/lib/security/incidents'
import { isActiveOn as isDormActiveOn } from '@/lib/dormitory/occupancy'

// ─── Студенты: разбивка по статусу обучения ──────────────────────────────────

/**
 * Сводка по education_journeys: всего и сколько в каждом education_status.
 * Пустой список → { total: 0, by_status: {} }.
 */
export function studentStatusSummary(
  journeys: { education_status: string }[],
): { total: number; by_status: Record<string, number> } {
  const by_status: Record<string, number> = {}
  for (const j of journeys) {
    by_status[j.education_status] = (by_status[j.education_status] ?? 0) + 1
  }
  return { total: journeys.length, by_status }
}

// ─── Финансы: начислено / собрано / долг ─────────────────────────────────────

/**
 * Финансовая сводка из уже посчитанных сумм в КОПЕЙКАХ (целых) и числа
 * должников. Считаем процент собираемости в копейках, чтобы избежать float-
 * дрейфа. При charged=0 (нет начислений) collection_rate=0 — деления на ноль нет.
 *   outstanding = charged − collected (может быть < 0 при переплате).
 */
export function financeSummary(
  chargesActiveCents: number,
  paymentsApprovedCents: number,
  debtorCount: number,
  discountsCents = 0,
): {
  charged: number
  discounts: number
  collected: number
  outstanding: number
  collection_rate: number
  debtor_count: number
} {
  // collection_rate — доля собранного от gross-начислений (формула без скидок,
  // как раньше). outstanding — РЕАЛЬНАЯ задолженность: начислено − скидки −
  // оплачено (то же правило, что в ledger-роуте).
  const collection_rate =
    chargesActiveCents === 0
      ? 0
      : Math.round((paymentsApprovedCents / chargesActiveCents) * 100)
  return {
    charged: centsToNumber(chargesActiveCents),
    discounts: centsToNumber(discountsCents),
    collected: centsToNumber(paymentsApprovedCents),
    outstanding: centsToNumber(chargesActiveCents - discountsCents - paymentsApprovedCents),
    collection_rate,
    debtor_count: debtorCount,
  }
}

// ─── Общежитие: занятость ────────────────────────────────────────────────────

/**
 * Сводка занятости: свободных = max(0, cap − occ) (никогда не отрицательно, даже
 * при переполнении). Процент = round(occ/cap*100); при cap=0 (нет коек) → 0 —
 * деления на ноль нет.
 */
export function occupancySummary(
  totalCapacity: number,
  occupied: number,
): { capacity: number; occupied: number; free: number; occupancy_percent: number } {
  const free = Math.max(0, totalCapacity - occupied)
  const occupancy_percent =
    totalCapacity === 0 ? 0 : Math.round((occupied / totalCapacity) * 100)
  return { capacity: totalCapacity, occupied, free, occupancy_percent }
}

// ─── Эксплуатация: заявки на обслуживание ────────────────────────────────────

/** Известные приоритеты заявок (из lib/maintenance/tickets): urgent/high/normal/low. */
const MAINTENANCE_PRIORITIES = Object.keys(PRIORITY_RANK) as (keyof typeof PRIORITY_RANK)[]

/**
 * Сводка по заявкам обслуживания. Вся сводка описывает АКТИВНУЮ нагрузку:
 *   open        — заявок в статусе open,
 *   in_progress — заявок в статусе in_progress,
 *   overdue     — активных заявок, просроченных по SLA (reuse isOverdue),
 *   by_priority — разбивка АКТИВНЫХ (open+in_progress) заявок по приоритету
 *                 (все известные приоритеты инициализируются нулём, чтобы форма
 *                 ответа была стабильной; неизвестный приоритет добавляется как есть).
 * todayISO — «сейчас» параметром (детерминизм, без Date.now). SLA меряется в ЧАСАХ,
 *            поэтому для точной внутридневной просрочки сюда передаётся ПОЛНЫЙ
 *            ISO-таймстамп (не только дата) — см. app/api/reports/maintenance.
 */
export function maintenanceSummary(
  tickets: { status: string; priority: string; reported_at: string }[],
  todayISO: string,
): { open: number; in_progress: number; overdue: number; by_priority: Record<string, number> } {
  let open = 0
  let in_progress = 0
  let overdue = 0
  const by_priority: Record<string, number> = {}
  for (const p of MAINTENANCE_PRIORITIES) by_priority[p] = 0

  for (const t of tickets) {
    if (t.status === 'open') open++
    else if (t.status === 'in_progress') in_progress++
    if (isOverdue(t, todayISO)) overdue++
    if (t.status === 'open' || t.status === 'in_progress') {
      by_priority[t.priority] = (by_priority[t.priority] ?? 0) + 1
    }
  }
  return { open, in_progress, overdue, by_priority }
}

// ─── Медпункт: приёмы и контрольные визиты ───────────────────────────────────

/**
 * Клиническая сводка (reuse doctor/medical visitStats): открытых приёмов и
 * сколько из открытых имеют предстоящий / просроченный контрольный визит.
 * Граница follow_up_date == сегодня — предстоящий (не просрочен). Закрытые
 * приёмы в счётчики контроля не попадают.
 */
export function clinicSummary(
  visits: VisitLike[],
  todayISO: string,
): { open_visits: number; upcoming_followups: number; overdue_followups: number } {
  const stats = visitStats(visits, todayISO)
  return {
    open_visits: stats.open,
    upcoming_followups: stats.upcoming_followups,
    overdue_followups: stats.overdue_followups,
  }
}

// ─── Психолог: сессии, контроль и уровни риска ───────────────────────────────

/**
 * Сводка консультаций (reuse psychologist/counseling sessionStats): открытых
 * сессий и предстоящих / просроченных контрольных консультаций, плюс разбивка
 * профилей по уровню риска (by_risk). by_risk считает по строкам profiles как
 * есть; пустой список профилей → {}.
 */
export function counselingSummary(
  sessions: SessionLike[],
  profiles: { risk_level: string }[],
  todayISO: string,
): {
  open_sessions: number
  upcoming_followups: number
  overdue_followups: number
  by_risk: Record<string, number>
} {
  const stats = sessionStats(sessions, todayISO)
  const by_risk: Record<string, number> = {}
  for (const p of profiles) {
    by_risk[p.risk_level] = (by_risk[p.risk_level] ?? 0) + 1
  }
  return {
    open_sessions: stats.open,
    upcoming_followups: stats.upcoming_followups,
    overdue_followups: stats.overdue_followups,
    by_risk,
  }
}

// ─── Питание: охват планами питания ──────────────────────────────────────────

/**
 * Сводка питания из уже посчитанных чисел: сколько студентов с активной
 * записью на план питания и сколько без. unenrolled = max(0, total − enrolled)
 * (никогда не отрицательно).
 */
export function foodSummary(
  activeEnrollments: number,
  totalStudents: number,
): { enrolled: number; unenrolled: number } {
  return {
    enrolled: activeEnrollments,
    unenrolled: Math.max(0, totalStudents - activeEnrollments),
  }
}

// ─── Документы: реестр и срок годности ───────────────────────────────────────

/**
 * Сводка реестра документов (reuse documents/expiry documentStats): всего,
 * активных, сколько просрочено и сколько истекает скоро. todayISO — ДАТА
 * 'YYYY-MM-DD' (сравнение дат), поэтому роут передаёт date, а не полный таймстамп.
 */
export function documentsSummary(
  docs: DocLike[],
  todayISO: string,
): { total: number; active: number; expired: number; expiring_soon: number } {
  const s = documentStats(docs, todayISO)
  return { total: s.total, active: s.active, expired: s.expired, expiring_soon: s.expiring_soon }
}

// ─── Спонсоры: пожертвования ─────────────────────────────────────────────────

/**
 * Сводка по спонсорам (reuse sponsors/donations donationStats): число доноров
 * (посчитано HEAD-COUNT в роуте) и суммы received / pledged в валюте (2 знака,
 * в копейках через money.ts — без float-дрейфа). Устойчиво к amount-строкам.
 */
export function sponsorsSummary(
  donations: DonationStatLike[],
  sponsorCount: number,
): { sponsor_count: number; total_received: number; total_pledged: number } {
  const s = donationStats(donations)
  return {
    sponsor_count: sponsorCount,
    total_received: s.total_received,
    total_pledged: s.total_pledged,
  }
}

// ─── Безопасность: инциденты ─────────────────────────────────────────────────

/**
 * Сводка по инцидентам (reuse security/incidents incidentStats): активные
 * (open+investigating) требуют внимания, плюс open отдельно и разбивка по
 * серьёзности. Пустой список → нули и {}.
 */
export function securitySummary(
  incidents: { status: string; severity: string }[],
): { active: number; open: number; investigating: number; by_severity: Record<string, number> } {
  const s = incidentStats(incidents)
  return { active: s.active, open: s.open, investigating: s.investigating, by_severity: s.by_severity }
}

// ─── ЕДИНЫЙ ИСТОЧНИК: чистые агрегаторы для серверных загрузчиков ────────────
//
// Используются lib/reports/metrics.ts, который вызывают И «דוחות» (/api/reports/*),
// И сводки модулей — чтобы одно и то же число было одинаковым на всех экранах.

/**
 * Финансовые итоги из строк (суммы в КОПЕЙКАХ, целые):
 *   chargeCentsByJourney   — Σ активных начислений по journey,
 *   paymentCentsByJourney  — Σ подтверждённых платежей по journey,
 *   discountCentsByJourney — Σ скидок по активным счетам journey.
 * Должник = journey с балансом (начислено − скидки − оплачено) > 0.
 * Возвращает общие суммы (копейки) и число должников.
 */
export function financeTotalsFromMaps(
  chargeCentsByJourney: Map<string, number>,
  paymentCentsByJourney: Map<string, number>,
  discountCentsByJourney: Map<string, number>,
): { chargesCents: number; paymentsCents: number; discountsCents: number; debtorCount: number } {
  let chargesCents = 0
  for (const c of chargeCentsByJourney.values()) chargesCents += c
  let paymentsCents = 0
  for (const c of paymentCentsByJourney.values()) paymentsCents += c
  let discountsCents = 0
  for (const c of discountCentsByJourney.values()) discountsCents += c

  let debtorCount = 0
  const ids = new Set<string>([...chargeCentsByJourney.keys(), ...paymentCentsByJourney.keys()])
  for (const jid of ids) {
    const balance =
      (chargeCentsByJourney.get(jid) ?? 0) -
      (discountCentsByJourney.get(jid) ?? 0) -
      (paymentCentsByJourney.get(jid) ?? 0)
    if (balance > 0) debtorCount++
  }
  return { chargesCents, paymentsCents, discountsCents, debtorCount }
}

/**
 * Полная статистика заявок обслуживания из ОДНИХ строк: форма модуля
 * (status_counts / total_overdue / total) и форма «דוחות» (summary) —
 * total_overdue и summary.overdue всегда равны (один и тот же isOverdue).
 */
export function maintenanceTicketStats(
  tickets: { status: string; priority: string; reported_at: string }[],
  nowISO: string,
): {
  total: number
  status_counts: Record<string, number>
  total_overdue: number
  summary: { open: number; in_progress: number; overdue: number; by_priority: Record<string, number> }
} {
  const status_counts = statusCounts(tickets)
  const summary = maintenanceSummary(tickets, nowISO)
  return { total: tickets.length, status_counts, total_overdue: summary.overdue, summary }
}

export interface BuildingOccupancy {
  building_id: string
  rooms_count: number
  total_capacity: number
  occupied: number
  free: number
}

/**
 * Занятость по зданиям + общий итог из ОДНИХ строк. Занято = назначения,
 * активные на todayISO (reuse isActiveOn — то же правило, что dormitory/occupancy).
 * Комнаты чужих (не переданных) зданий не учитываются. Общий итог = сумма по
 * зданиям, поэтому сумма плиток зданий всегда равна числу в «דוחות».
 */
export function aggregateOccupancy(
  buildingIds: string[],
  rooms: { id: string; building_id: string; capacity: number }[],
  assignmentsByRoom: Map<string, { assigned_from: string; assigned_to: string | null; status: string }[]>,
  todayISO: string,
): {
  buildings: BuildingOccupancy[]
  total: ReturnType<typeof occupancySummary> & { building_count: number; room_count: number }
} {
  const agg = new Map<string, BuildingOccupancy>()
  for (const id of buildingIds) {
    agg.set(id, { building_id: id, rooms_count: 0, total_capacity: 0, occupied: 0, free: 0 })
  }
  let roomCount = 0
  for (const r of rooms) {
    const a = agg.get(r.building_id)
    if (!a) continue
    roomCount++
    a.rooms_count += 1
    a.total_capacity += r.capacity ?? 0
    a.occupied += (assignmentsByRoom.get(r.id) ?? []).filter(x => isDormActiveOn(x, todayISO)).length
  }
  let cap = 0
  let occ = 0
  const buildings = buildingIds.map(id => {
    const a = agg.get(id)!
    a.free = Math.max(0, a.total_capacity - a.occupied)
    cap += a.total_capacity
    occ += a.occupied
    return a
  })
  return {
    buildings,
    total: { ...occupancySummary(cap, occ), building_count: buildingIds.length, room_count: roomCount },
  }
}
