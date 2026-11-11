import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable, isMissingColumn } from '@/lib/supabase/errors'
import type { SessionPayload } from '@/lib/auth/jwt'
import { canManageTracksCatalog } from '@/lib/education/permissions'
import type { StudentTrackRow, TrackLite, TrackRole } from './track-picking'

// ─── «המסלול שלי»: ответственные маршрутов (study_track_managers) ─────────────
// Таблицы ещё нет в сгенерированных типах — нетипизированный клиент.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySB = any

export function db(): AnySB {
  return createServerClient() as AnySB
}

export interface TrackFull extends TrackLite {
  name_he: string
  name_ru: string
  name_en: string
  is_active: boolean
  sort_order: number
}

/** Весь каталог маршрутов (с неактивными — чтобы показывать имена у студенток). */
export async function loadTrackCatalog(sb: AnySB): Promise<TrackFull[]> {
  let { data, error } = await sb.from('study_tracks')
    .select('id, code, category, name_he, name_ru, name_en, is_active, sort_order')
    .order('sort_order', { ascending: true })
  if (error && isMissingColumn(error)) {
    const fb = await sb.from('study_tracks')
      .select('id, code, name_he, name_ru, name_en, is_active, sort_order')
      .order('sort_order', { ascending: true })
    data = (fb.data ?? []).map((t: Record<string, unknown>) => ({ ...t, category: null }))
    error = fb.error
  }
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as TrackFull[]
}

/**
 * Какие маршруты пользователь может вести на «המסלול שלי»: superadmin и
 * manage_tracks (каталог) — все активные; иначе — те, где он ответственный.
 * Нет таблицы (миграция не применена) → только администраторам.
 */
export async function myManagedTrackIds(sb: AnySB, session: SessionPayload, catalog: TrackFull[]): Promise<{ ids: string[]; admin: boolean }> {
  const admin = (session.roles ?? []).includes('superadmin') || (await canManageTracksCatalog(session))
  if (admin) return { ids: catalog.filter(t => t.is_active).map(t => t.id), admin }
  const { data, error } = await sb.from('study_track_managers').select('track_id').eq('person_id', session.person_id)
  if (error) {
    if (isMissingTable(error)) return { ids: [], admin }
    throw error
  }
  const active = new Set(catalog.filter(t => t.is_active).map(t => t.id))
  return { ids: ((data ?? []) as Array<{ track_id: string }>).map(r => r.track_id).filter(id => active.has(id)), admin }
}

/** Текущие (не завершённые) светские маршруты студенток: journey_id → строки. */
export async function loadStudentTracks(sb: AnySB, journeyIds: string[]): Promise<Map<string, StudentTrackRow[]>> {
  const out = new Map<string, StudentTrackRow[]>()
  for (let i = 0; i < journeyIds.length; i += 300) {
    const chunk = journeyIds.slice(i, i + 300)
    let { data, error } = await sb.from('journey_study_tracks')
      .select('journey_id, track_id, role, completed_at, specialization_id').in('journey_id', chunk)
    if (error && isMissingColumn(error)) {
      ;({ data, error } = await sb.from('journey_study_tracks')
        .select('journey_id, track_id, role, completed_at').in('journey_id', chunk))
    }
    if (error && isMissingColumn(error)) {
      const fb = await sb.from('journey_study_tracks').select('journey_id, track_id').in('journey_id', chunk)
      data = (fb.data ?? []).map((r: Record<string, unknown>) => ({ ...r, role: 'primary', completed_at: null }))
      error = fb.error
    }
    if (error) {
      if (isMissingTable(error)) return out
      throw error
    }
    for (const r of (data ?? []) as Array<{ journey_id: string; track_id: string | null; role: string | null; completed_at: string | null; specialization_id?: string | null }>) {
      if (!r.track_id || r.completed_at) continue
      const role: TrackRole = r.role === 'additional' ? 'additional' : 'primary'
      const list = out.get(r.journey_id) ?? []
      list.push({ track_id: r.track_id, role, specialization_id: r.specialization_id ?? null })
      out.set(r.journey_id, list)
    }
  }
  return out
}
