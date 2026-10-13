import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { materializeChavrutaSchedule } from '@/lib/chavruta/schedule'
import { cronAuthGuard } from '@/lib/cron/auth'

/**
 * GET /api/cron/chavruta — вечерний проход по «חברותות קבועות» (Vercel Cron).
 *
 * Утренний /api/cron/reminders напоминает о встречах дня и спрашивает про
 * вчерашние. Этот проход вечером задаёт вопрос «была ли встреча» про
 * сегодняшние, уже прошедшие встречи — даже если мора не открывала сайт (при
 * открытом сайте вопрос приходит раньше, через опрос колокольчика).
 *
 * Защита та же, что у остальных cron (fail-closed, lib/cron/auth).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = cronAuthGuard(request)
  if (denied) return denied

  const sb = createServerClient()
  const chavrutaNotifications = await materializeChavrutaSchedule(sb)
  return NextResponse.json({ ok: true, chavruta_notifications: chavrutaNotifications })
}
