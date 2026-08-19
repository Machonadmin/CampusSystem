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
