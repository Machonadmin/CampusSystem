import { createServerClient } from '@/lib/supabase/server'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'
import {
  PHOTO_DOC_TYPE, PHOTO_URL_TTL_SECONDS, pickLatestPhotoPaths,
  type JourneyOwner, type PhotoDoc,
} from './profile-photos'

// Чтение фото профиля из БД и подписанные ссылки (только сервер).
// Правила выбора фото — в ./profile-photos.ts.

/** person_id → подписанная ссылка на фото. Людей без фото в ответе нет. */
export async function loadProfilePhotoUrls(personIds: readonly string[]): Promise<Record<string, string>> {
  if (personIds.length === 0) return {}
  const sb = createServerClient()

  const { data: journeys, error: jErr } = await sb
    .from('education_journeys')
    .select('id, person_id')
    .in('person_id', [...personIds])
  if (jErr) throw jErr
  const owned = (journeys ?? []) as JourneyOwner[]
  if (owned.length === 0) return {}

  const { data: docs, error: dErr } = await sb
    .from('document_records')
    .select('journey_id, storage_path, mime_type, created_at')
    .in('journey_id', owned.map(j => j.id))
    .eq('doc_type', PHOTO_DOC_TYPE)
    .eq('status', 'active')
    .not('storage_path', 'is', null)
  if (dErr) throw dErr

  const paths = pickLatestPhotoPaths(owned, (docs ?? []) as PhotoDoc[])
  if (paths.size === 0) return {}

  const { data: signed, error: sErr } = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls([...paths.values()], PHOTO_URL_TTL_SECONDS)
  if (sErr) throw sErr
  const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl ?? null]))

  const out: Record<string, string> = {}
  for (const [personId, path] of paths) {
    const url = urlByPath.get(path)
    if (url) out[personId] = url
  }
  return out
}
