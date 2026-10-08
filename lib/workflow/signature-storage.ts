import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'

// ─── Хранилище изображений рукописных подписей ──────────────────────────────
//
// Переиспользуем приватный бакет 'documents' (server-signed URLs). Ключевая
// защита (из ревью дизайна): путь ЖЁСТКО привязан к stage_instance_id —
// signatures/<stageInstanceId>/<uuid>.png. Клиент НИКОГДА не задаёт путь
// напрямую; при завершении этапа путь валидируется по этому шаблону и по факту
// существования объекта, иначе подписью можно было бы «указать» на чужой
// приватный документ в том же бакете (IDOR).

const SIG_PREFIX = 'signatures'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ожидаемая папка подписей данного этапа. */
export function signatureFolder(stageInstanceId: string): string {
  return `${SIG_PREFIX}/${stageInstanceId}`
}

/**
 * Строго проверяет, что drawing_path принадлежит ИМЕННО этому этапу и имеет вид
 * signatures/<stageInstanceId>/<uuid>.png. Отвергает любой другой объект бакета.
 */
export function isValidSignaturePath(path: string, stageInstanceId: string): boolean {
  if (!UUID_RE.test(stageInstanceId)) return false
  const m = /^signatures\/([^/]+)\/([0-9a-f-]{36})\.png$/i.exec(path)
  if (!m) return false
  return m[1] === stageInstanceId && UUID_RE.test(m[2])
}

/** Загружает PNG подписи и возвращает её storage_path (server-set путь). */
export async function uploadSignatureImage(stageInstanceId: string, file: File): Promise<{ storage_path: string }> {
  const sb = createServerClient()
  const path = `${signatureFolder(stageInstanceId)}/${randomUUID()}.png`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw Object.assign(new Error(error.message), { status: 500 })
  return { storage_path: path }
}

// ─── Подписи финансовых операций (платёж, скидка) ───────────────────────────
// Та же защита от IDOR, но привязка — к студентке (journey_id):
// signatures/finance/<journeyId>/<uuid>.png. Путь этапа (signatures/<uuid>/…)
// и путь финансов взаимно не проходят валидацию друг друга.

export function financeSignatureFolder(journeyId: string): string {
  return `${SIG_PREFIX}/finance/${journeyId}`
}

export function isValidFinanceSignaturePath(path: string, journeyId: string): boolean {
  if (!UUID_RE.test(journeyId)) return false
  const m = /^signatures\/finance\/([^/]+)\/([0-9a-f-]{36})\.png$/i.exec(path)
  if (!m) return false
  return m[1].toLowerCase() === journeyId.toLowerCase() && UUID_RE.test(m[2])
}

export async function uploadFinanceSignatureImage(journeyId: string, file: File): Promise<{ storage_path: string }> {
  const sb = createServerClient()
  const path = `${financeSignatureFolder(journeyId)}/${randomUUID()}.png`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw Object.assign(new Error(error.message), { status: 500 })
  return { storage_path: path }
}

export async function financeSignatureImageExists(journeyId: string, path: string): Promise<boolean> {
  if (!isValidFinanceSignaturePath(path, journeyId)) return false
  const sb = createServerClient()
  const fileName = path.split('/').pop()
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).list(financeSignatureFolder(journeyId), { search: fileName })
  if (error || !data) return false
  return data.some(o => o.name === fileName)
}

/**
 * Короткоживущие ссылки на рисунки подписей (пакетно). Возвращает path → url;
 * пути, для которых ссылку получить не удалось, просто отсутствуют в карте.
 */
export async function signatureImageUrls(paths: string[], expiresInSeconds = 600): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(paths.filter(p => typeof p === 'string' && p.startsWith(`${SIG_PREFIX}/`)))]
  if (unique.length === 0) return out
  const sb = createServerClient()
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrls(unique, expiresInSeconds)
  if (error || !data) return out
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl)
  }
  return out
}

/**
 * Подтверждает, что объект по drawing_path реально существует в папке этапа —
 * защита от «указания» на несуществующий/чужой путь мимо загрузки.
 */
export async function signatureImageExists(stageInstanceId: string, path: string): Promise<boolean> {
  if (!isValidSignaturePath(path, stageInstanceId)) return false
  const sb = createServerClient()
  const fileName = path.split('/').pop()
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).list(signatureFolder(stageInstanceId))
  if (error || !data) return false
  return data.some(o => o.name === fileName)
}
