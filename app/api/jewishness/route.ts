import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'

/**
 * GET /api/jewishness — плейсхолдер списка проверок яхадут. Пока возвращает
 * пустой список; реальные записи проверки + загрузка документов появятся в
 * следующих шагах. Право: jewishness.access (superadmin — в обход).
 */
export async function GET() {
  try {
    await requireJewishnessAccess()
    return NextResponse.json({ items: [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json(
      { error: e.message ?? serverT('generic_error') },
      { status: e.status ?? 500 },
    )
  }
}
