import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'

// ─── Скриншоты замечаний (Supabase Storage) ──────────────────────────────────
//
// Приватный бакет `feedback` (миграция 20261009160000); загрузка и подписанные
// ссылки — только на сервере через service-role ключ, как у документов
// (lib/documents/storage.ts).

export const FEEDBACK_BUCKET = 'feedback'

export interface StoredScreenshot {
  path: string
  name: string
  mime: string
  size: number
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Загружает скриншот по пути reports/<personId>/<uuid>.<ext>. Бросает { status } при ошибке. */
export async function uploadScreenshot(personId: string, file: File): Promise<StoredScreenshot> {
  const sb = createServerClient()
  const mime = file.type
  const path = `reports/${personId}/${randomUUID()}.${EXT[mime] ?? 'img'}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await sb.storage.from(FEEDBACK_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw Object.assign(new Error(error.message), { status: 500 })
  const name = (file.name || 'screenshot').split(/[\\/]/).pop()!.slice(0, 120)
  return { path, name, mime, size: file.size }
}

/** Удаление уже загруженных файлов, если вставка строки не удалась. Ошибки не важны. */
export async function removeScreenshots(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error: _err } = await createServerClient().storage.from(FEEDBACK_BUCKET).remove(paths)
  } catch { /* файл-сирота не страшен */ }
}

/** Подписанные ссылки на скриншоты; ошибка одной ссылки не валит весь список. */
export async function signScreenshots(
  shots: readonly StoredScreenshot[],
  expiresInSeconds = 600,
): Promise<Array<StoredScreenshot & { url: string | null }>> {
  if (shots.length === 0) return []
  const sb = createServerClient()
  const { data } = await sb.storage
    .from(FEEDBACK_BUCKET)
    .createSignedUrls(shots.map(s => s.path), expiresInSeconds)
  const byPath = new Map((data ?? []).map(d => [d.path, d.signedUrl ?? null]))
  return shots.map(s => ({ ...s, url: byPath.get(s.path) ?? null }))
}

/** screenshots из БД (JSONB) → типизированный список; мусор отбрасывается. */
export function parseStoredScreenshots(v: unknown): StoredScreenshot[] {
  if (!Array.isArray(v)) return []
  return v.filter((s): s is StoredScreenshot =>
    !!s && typeof s === 'object'
    && typeof (s as StoredScreenshot).path === 'string'
    && typeof (s as StoredScreenshot).mime === 'string',
  )
}
