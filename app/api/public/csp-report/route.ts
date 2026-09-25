import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { apiError } from '@/lib/i18n/api-errors'
import { rateLimit, clientIp } from '@/lib/public/rate-limit'
import { getAppSetting, setAppSetting } from '@/lib/settings/app-settings'
import {
  CSP_REPORTS_KEY, parseCspReports, mergeCspEntries, violationKey, type CspEntry,
} from '@/lib/security/csp-report'

/**
 * POST /api/public/csp-report — сюда браузер присылает нарушения политики
 * Content-Security-Policy-Report-Only (next.config.js). Публичный: браузер шлёт
 * отчёт без cookie. Сворачивается в сводку в app_settings (lib/security/csp-report.ts).
 *
 * GET /api/public/csp-report — сводка для superadmin (открыть в браузере).
 *
 * Защита от мусора: тело не больше 16 KB, не больше 30 отчётов в минуту с
 * одного IP, одно и то же нарушение пишется в базу не чаще раза в 5 минут с
 * одного инстанса (счётчик поэтому приблизительный).
 */

export const dynamic = 'force-dynamic'

const MAX_BODY = 16 * 1024
const WRITE_EVERY_MS = 5 * 60 * 1000
const recentlyWritten = new Map<string, number>()

export async function POST(request: NextRequest) {
  const rl = rateLimit(`csp-report:${clientIp(request.headers)}`, 30, 60 * 1000)
  if (!rl.ok) return new NextResponse(null, { status: 429 })

  const text = await request.text().catch(() => '')
  if (text.length === 0 || text.length > MAX_BODY) return new NextResponse(null, { status: 400 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const now = Date.now()
  if (recentlyWritten.size > 1000) recentlyWritten.clear()
  const fresh = parseCspReports(body).filter(v => {
    const last = recentlyWritten.get(violationKey(v))
    return last === undefined || now - last > WRITE_EVERY_MS
  })
  if (fresh.length === 0) return new NextResponse(null, { status: 204 })

  try {
    const list = await getAppSetting<CspEntry[]>(CSP_REPORTS_KEY, [])
    await setAppSetting(CSP_REPORTS_KEY, mergeCspEntries(Array.isArray(list) ? list : [], fresh), null)
    for (const v of fresh) recentlyWritten.set(violationKey(v), now)
  } catch (err) {
    // Отчёт — не критичная информация: браузеру всё равно, сохранили ли мы его.
    console.error('[csp-report] save failed:', (err as { message?: string })?.message ?? err)
  }
  return new NextResponse(null, { status: 204 })
}

export async function GET() {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)
  if (session.principal === 'student' || !session.roles.includes('superadmin')) return apiError('forbidden', 403)
  const list = await getAppSetting<CspEntry[]>(CSP_REPORTS_KEY, [])
  return NextResponse.json({ total: Array.isArray(list) ? list.length : 0, entries: list })
}
