import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { DOCUMENTS_BUCKET, sanitizeFileName } from '@/lib/documents/storage'

// ─── Файлы מטלות להגשה ───────────────────────────────────────────────────────
//
// Тот же приватный бакет `documents`, отдельный префикс submissions/. Загрузка
// и подписанные ссылки — только на сервере (service-role); доступ решают
// маршруты (ученица — только своя сдача, сотрудник — view_students группы).

/** Максимальный размер сдаваемого файла — 15 МБ (как у документов). */
export const MAX_SUBMISSION_BYTES = 15 * 1024 * 1024

/** PDF, изображения, Word, PowerPoint, Excel. */
export const SUBMISSION_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export function isAllowedSubmissionMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && (SUBMISSION_MIME_TYPES as readonly string[]).includes(mime)
}

export interface UploadedSubmission {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

/** Загрузить файл сдачи. Бросает { status: 500 } при ошибке хранилища. */
export async function uploadSubmission(assessmentId: string, journeyId: string, file: File): Promise<UploadedSubmission> {
  const sb = createServerClient()
  const safeName = sanitizeFileName(file.name)
  const mime = file.type || 'application/octet-stream'
  const path = `submissions/${assessmentId}/${journeyId}/${randomUUID()}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, { contentType: mime, upsert: false })
  if (error) throw Object.assign(new Error(error.message), { status: 500 })
  return { storage_path: path, file_name: safeName, mime_type: mime, size_bytes: file.size }
}

/** Удалить старый файл после замены сдачи (best-effort, ошибки игнорируются). */
export async function removeSubmissionFile(storagePath: string): Promise<void> {
  try {
    const sb = createServerClient()
    const { error: _err } = await sb.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
  } catch {
    /* файл-сирота не критичен */
  }
}
