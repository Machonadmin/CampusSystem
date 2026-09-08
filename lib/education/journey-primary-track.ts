import type { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn, isMissingRelation, isMissingTable } from '@/lib/supabase/errors'

type SB = ReturnType<typeof createServerClient>

/**
 * Назначить/сменить ГЛАВНЫЙ (primary) учебный маршрут студентки — ОДНО место
 * для двух экранов: панели маршрута (PUT /api/education/journeys/[id]/track,
 * role='primary') и завершения этапа приёма (complete stage с result_data.track_id),
 * чтобы оба писали journey_study_tracks одинаково.
 *
 * Схема после миграции 20260903100200: PK (journey_id, track_id), колонка
 * role ('primary'|'additional'), partial-unique «не более одного primary на
 * journey». Поэтому «поставить главный маршрут» = снять ДРУГИЕ primary-строки
 * этой journey и upsert по (journey_id, track_id) с role='primary'. Семантика
 * та же, что была в прежней 1:1-модели (upsert по journey_id = ЗАМЕНА маршрута).
 *
 * Deploy-safe:
 *   • колонки role ещё нет (42703 / PGRST204) → откат к legacy upsert по journey_id;
 *   • таблицы ещё нет (42P01 / PGRST205) → { ok: true, mode: 'not_migrated' } (no-op);
 *   • прочие ошибки (например 23503 — неизвестный track_id) → { ok: false, error },
 *     решает вызывающий (400 / лог).
 */
export interface SetPrimaryTrackInput {
  journeyId: string
  trackId: string
  updatedBy: string | null
  /**
   * Заметка к маршруту. НЕ передано (undefined) → существующая заметка НЕ трогается
   * (завершение этапа приёма подтверждает маршрут, не редактируя заметку);
   * передано (строка или null) → записывается как есть (панель маршрута).
   */
  notes?: string | null
  /** 1..8 — курс/год обучения на маршруте; иное игнорируется. */
  yearLevel?: number
  /** Снять отметку completed_at (повторное зачисление на маршрут). */
  reactivate?: boolean
}

export type SetPrimaryTrackResult =
  | { ok: true; mode: 'multi' | 'legacy' | 'not_migrated' }
  | { ok: false; error: { code?: string; message?: string } }

export function normalizeTrackNotes(notes: string | null | undefined): string | null {
  const s = notes == null ? '' : String(notes).trim()
  return s ? s.slice(0, 2000) : null
}

export function buildPrimaryTrackPayload(input: SetPrimaryTrackInput, nowIso: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    journey_id: input.journeyId,
    track_id: input.trackId,
    role: 'primary',
    updated_by: input.updatedBy,
    updated_at: nowIso,
  }
  // notes — только если вызывающий их передал: upsert без ключа notes оставляет
  // существующую заметку нетронутой (иначе подтверждение того же маршрута на
  // финальном этапе молча стирало бы заметку секретаря).
  if (input.notes !== undefined) payload.notes = normalizeTrackNotes(input.notes)
  if (typeof input.yearLevel === 'number' && input.yearLevel >= 1 && input.yearLevel <= 8) {
    payload.year_level = input.yearLevel
  }
  if (input.reactivate) payload.completed_at = null
  return payload
}

export async function setPrimaryStudyTrack(sb: SB, input: SetPrimaryTrackInput): Promise<SetPrimaryTrackResult> {
  const nowIso = new Date().toISOString()

  // 0. Маршрут существует? Проверяем ДО удаления других primary-строк: delete и
  // upsert — два отдельных запроса (не транзакция), и если upsert упал бы на
  // неизвестном track_id (23503), journey осталась бы вовсе без главного маршрута.
  const { data: track, error: trackErr } = await sb
    .from('study_tracks').select('id').eq('id', input.trackId).maybeSingle()
  if (trackErr) {
    if (isMissingTable(trackErr)) return { ok: true, mode: 'not_migrated' }
    return { ok: false, error: trackErr }
  }
  if (!track) return { ok: false, error: { code: '23503', message: `study track ${input.trackId} not found` } }

  // 1. Снять другие primary-строки этой journey (не более одного главного маршрута).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (sb.from('journey_study_tracks').delete()
    .eq('journey_id', input.journeyId).eq('role', 'primary').neq('track_id', input.trackId) as any)
  if (delErr && !isMissingRelation(delErr)) return { ok: false, error: delErr }

  // 2. Upsert по (journey_id, track_id) с role='primary'.
  const payload = buildPrimaryTrackPayload(input, nowIso)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from('journey_study_tracks').upsert(payload as any, { onConflict: 'journey_id,track_id' }) as any)
  if (!error) return { ok: true, mode: 'multi' }

  // 3. До миграции (нет role): legacy 1:1 upsert по journey_id (notes — тоже только если переданы).
  if (isMissingColumn(error)) {
    const legacy: Record<string, unknown> = {
      journey_id: input.journeyId, track_id: input.trackId, updated_by: input.updatedBy, updated_at: nowIso,
    }
    if (input.notes !== undefined) legacy.notes = normalizeTrackNotes(input.notes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retry = await (sb.from('journey_study_tracks').upsert(legacy as any, { onConflict: 'journey_id' }) as any)
    if (!retry.error) return { ok: true, mode: 'legacy' }
    if (isMissingTable(retry.error)) return { ok: true, mode: 'not_migrated' }
    return { ok: false, error: retry.error }
  }
  if (isMissingTable(error)) return { ok: true, mode: 'not_migrated' }
  return { ok: false, error }
}
