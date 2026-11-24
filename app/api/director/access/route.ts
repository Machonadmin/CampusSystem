import { NextResponse } from 'next/server'
import { requireAuth, jsonError } from '@/lib/api/handler'
import { createServerClient } from '@/lib/supabase/server'
import { directorSpaceAccess } from '@/lib/director/access'

/**
 * GET /api/director/access — показывать ли пункт «מרחב המנהל» в меню.
 * { role: 'director' | 'secretary' | null } — без данных, только роль.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    const access = await directorSpaceAccess(createServerClient(), session)
    return NextResponse.json({ role: access?.role ?? null })
  } catch (err) {
    return jsonError(err)
  }
}
