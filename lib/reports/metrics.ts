// ─── Отчёты — ЕДИНЫЙ ИСТОЧНИК цифр (серверные загрузчики) ────────────────────
//
// Решение владельца (#10 «Reports: one source»): «דוחות» — центр, а сводки в
// модулях остаются, но считаются ЭТИМИ ЖЕ загрузчиками, поэтому одно и то же
// число одинаково везде. Каждый загрузчик:
//   • читает строки ПОСТРАНИЧНО (db-max-rows молча режет выдачу),
//   • отдаёт расчёт в чистые функции (summaries.ts / funnel.ts, покрыты тестами),
//   • ошибки БД пробрасывает — их маппит catch конкретного роута.
// Здесь только чтение; никаких записей.

import type { createServerClient } from '@/lib/supabase/server'
import { pageAll } from '@/lib/reports/paging'
import { toCents } from '@/lib/finance/money'
import { sumDiscountCentsForCharges } from '@/lib/finance/discounts'
import { incidentStats, type IncidentStats } from '@/lib/security/incidents'
import { roomsOfBuildings, activeAssignmentsByRoom } from '@/lib/dormitory/occupancy-server'
import { todayISO } from '@/lib/dates'
import { admissionFunnel, type AdmissionFunnel } from '@/lib/reports/funnel'
import {
  financeSummary,
  financeTotalsFromMaps,
  maintenanceTicketStats,
  aggregateOccupancy,
  type BuildingOccupancy,
} from '@/lib/reports/summaries'

type Sb = ReturnType<typeof createServerClient>

// ─── Финансы ─────────────────────────────────────────────────────────────────

export interface FinanceTotalsOptions {
  /** Начало периода 'YYYY-MM-DD' (charges — по created_at, payments — по paid_at). */
  from?: string | null
  /** Конец периода 'YYYY-MM-DD' включительно. */
  to?: string | null
  /**
   * Ограничение набора journey. Без scope — ВСЕ journey с начислениями/платежами
   * (решение владельца: сводка сбора считает всех, кто должен, не только
   * education_status='student').
   */
  scope?: { journeyIds?: string[] } | null
}

export type FinanceTotals = ReturnType<typeof financeSummary>

/** Размер пачки id для .in(...) (длина URL PostgREST). */
const IN_CHUNK = 200

/**
 * Финансовые итоги по правилу баланса (то же, что ledger-роут):
 *   charged   = Σ(finance_charges.amount WHERE status='active')
 *   discounts = Σ(finance_discounts.amount по этим активным счетам)
 *   collected = Σ(finance_payments.amount WHERE status='approved')
 *   outstanding = charged − discounts − collected (НЕ обрезается нулём:
 *                 отрицательное значение = переплата)
 *   debtor_count = journey с (начислено − скидки − оплачено) > 0.
 * Возвращает summary + число прочитанных строк (row_count) — чтобы карточка
 * студентки могла понять «в модуле нет данных».
 */
export async function loadFinanceTotals(
  sb: Sb,
  { from = null, to = null, scope = null }: FinanceTotalsOptions = {},
): Promise<{ summary: FinanceTotals; row_count: number }> {
  const ids = scope?.journeyIds
  // scope задан, но пуст → нет строк (не «все»).
  const idChunks: (string[] | null)[] = ids
    ? Array.from({ length: Math.ceil(ids.length / IN_CHUNK) }, (_, i) => ids.slice(i * IN_CHUNK, (i + 1) * IN_CHUNK))
    : [null]

  const chargeByJourney = new Map<string, number>()
  const chargeToJourney = new Map<string, string>()
  const payByJourney = new Map<string, number>()
  let rowCount = 0

  for (const chunk of idChunks) {
    const chargeRows = await pageAll<{ id: string; journey_id: string; amount: number | string }>((pFrom, pTo) => {
      let q = sb.from('finance_charges').select('id, journey_id, amount').eq('status', 'active')
      if (chunk) q = q.in('journey_id', chunk)
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', `${to}T23:59:59.999`)
      return q.order('id', { ascending: true }).range(pFrom, pTo)
    })
    const payRows = await pageAll<{ journey_id: string; amount: number | string }>((pFrom, pTo) => {
      let q = sb.from('finance_payments').select('journey_id, amount').eq('status', 'approved')
      if (chunk) q = q.in('journey_id', chunk)
      if (from) q = q.gte('paid_at', from)
      if (to) q = q.lte('paid_at', to)
      return q.order('id', { ascending: true }).range(pFrom, pTo)
    })
    rowCount += chargeRows.length + payRows.length
    for (const r of chargeRows) {
      chargeByJourney.set(r.journey_id, (chargeByJourney.get(r.journey_id) ?? 0) + toCents(r.amount))
      chargeToJourney.set(r.id, r.journey_id)
    }
    for (const r of payRows) {
      payByJourney.set(r.journey_id, (payByJourney.get(r.journey_id) ?? 0) + toCents(r.amount))
    }
  }

  // Скидки по учитываемым (активным, и в периоде — если задан) счетам.
  const discountByJourney = await sumDiscountCentsForCharges(sb, chargeToJourney)
  const t = financeTotalsFromMaps(chargeByJourney, payByJourney, discountByJourney)
  return {
    summary: financeSummary(t.chargesCents, t.paymentsCents, t.debtorCount, t.discountsCents),
    row_count: rowCount,
  }
}

// ─── Приём: воронка ──────────────────────────────────────────────────────────

/**
 * Воронка приёма по ЖИВЫМ journey (is_deleted = false — soft-deleted не
 * считаются нигде). Расчёт — admissionFunnel (lib/reports/funnel.ts).
 */
export async function loadAdmissionFunnel(sb: Sb): Promise<AdmissionFunnel> {
  const journeys = await pageAll<{ education_status: string | null }>((from, to) =>
    sb
      .from('education_journeys')
      .select('education_status')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(from, to),
  )
  return admissionFunnel(journeys)
}

// ─── Эксплуатация: заявки ────────────────────────────────────────────────────

/** Статистика заявок обслуживания (форма модуля + форма «דוחות») из одних строк. */
export async function loadMaintenanceTicketStats(
  sb: Sb,
  nowISO: string = new Date().toISOString(),
): Promise<ReturnType<typeof maintenanceTicketStats>> {
  const tickets = await pageAll<{ status: string; priority: string; reported_at: string }>((from, to) =>
    sb
      .from('maintenance_requests')
      .select('status, priority, reported_at')
      .order('id', { ascending: true })
      .range(from, to),
  )
  return maintenanceTicketStats(tickets, nowISO)
}

// ─── Безопасность: инциденты ─────────────────────────────────────────────────

/** Статистика инцидентов (incidentStats) — общая для модуля и «דוחות». */
export async function loadIncidentStats(sb: Sb): Promise<IncidentStats> {
  const rows = await pageAll<{ status: string; severity: string }>((from, to) =>
    sb
      .from('security_incidents')
      .select('status, severity')
      .order('id', { ascending: true })
      .range(from, to),
  )
  return incidentStats(rows)
}

// ─── Общежитие: занятость ────────────────────────────────────────────────────

export const DORM_BUILDING_SELECT =
  'id, name, code, gender, address, notes, is_active, created_at, updated_at'

export interface DormBuildingRow {
  id: string
  name: string
  code: string | null
  gender: string
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Занятость на сегодня: по каждому зданию и общий итог (сумма по зданиям).
 * Занято = назначения status='active', активные на сегодня (isActiveOn).
 */
export async function loadOccupancy(
  sb: Sb,
  today: string = todayISO(),
): Promise<{
  buildings: (DormBuildingRow & Omit<BuildingOccupancy, 'building_id'>)[]
  total: ReturnType<typeof aggregateOccupancy>['total']
}> {
  const buildings = await pageAll<DormBuildingRow>((from, to) =>
    sb
      .from('dorm_buildings')
      .select(DORM_BUILDING_SELECT)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  const buildingIds = buildings.map(b => b.id)
  const rooms = await roomsOfBuildings(sb, buildingIds)
  const asgByRoom = await activeAssignmentsByRoom(sb, rooms.map(r => r.id))
  const agg = aggregateOccupancy(buildingIds, rooms, asgByRoom, today)
  return {
    buildings: buildings.map((b, i) => {
      const { rooms_count, total_capacity, occupied, free } = agg.buildings[i]
      return { ...b, rooms_count, total_capacity, occupied, free }
    }),
    total: agg.total,
  }
}
