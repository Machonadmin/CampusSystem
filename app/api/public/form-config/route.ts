import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getPublicFormConfig } from '@/lib/public/form-config'

// Всегда свежая конфигурация (иначе Next закэширует на этапе сборки).
export const dynamic = 'force-dynamic'

/**
 * GET /api/public/form-config — ПУБЛИЧНЫЙ (без сессии; см. middleware
 * PUBLIC_API_PREFIXES). Отдаёт конфигурацию публичной формы заявки: какие поля
 * показывать/делать обязательными, кастомные поля, режим направлений и
 * переопределения маркетинговых текстов. Только структура формы, без PII —
 * раскрывать публично безопасно.
 */
export async function GET() {
  try {
    const config = await getPublicFormConfig()
    return NextResponse.json(config)
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
