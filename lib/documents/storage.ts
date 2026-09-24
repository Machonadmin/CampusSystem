import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'

// ─── Хранилище файлов документов (Supabase Storage) ─────────────────────────
//
// Приватный бакет `documents`; загрузка и подписанные ссылки — только на
// сервере через service-role ключ (обходит storage RLS). Доступ ограничивает
// слой прав модуля (lib/documents/permissions.ts), а не storage-политики.

export const DOCUMENTS_BUCKET = 'documents'

/** Максимальный размер загружаемого файла — 15 МБ. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/** Допустимые mime-типы: PDF, изображения, Word. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

export function isAllowedMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
}

/** Убираем путь и небезопасные символы, сохраняя расширение; ограничиваем длину. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(0, 120)
  return cleaned.replace(/^_+|_+$/g, '') || 'file'
}

export interface UploadedDoc {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

/**
 * Загружает файл в приватный бакет по пути journeys/<journeyId>/<uuid>-<имя>.
 * Возвращает метаданные для строки document_records. Бросает { status } при ошибке.
 */
export async function uploadDocument(journeyId: string, file: File): Promise<UploadedDoc> {
  const sb = createServerClient()
  const safeName = sanitizeFileName(file.name)
  const mime = file.type || 'application/octet-stream'
  const path = `journeys/${journeyId}/${randomUUID()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 })
  }

  return { storage_path: path, file_name: safeName, mime_type: mime, size_bytes: file.size }
}

/** Свежая подписанная ссылка (по умолчанию 5 минут) для просмотра/скачивания. */
export async function getSignedUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
  const sb = createServerClient()
  const { data, error } = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    throw Object.assign(new Error(error?.message ?? 'signed url error'), { status: 500 })
  }
  return data.signedUrl
}
