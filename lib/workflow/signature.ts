import type { SignatureMethod } from '@/lib/settings/app-settings'
import { isValidSignaturePath } from './signature-storage'

// ─── Валидация полезной нагрузки подписи (чистая функция) ────────────────────
//
// Личность подписанта здесь НЕ участвует — signed_by берётся из сессии на
// сервере, никогда из этого payload. Здесь проверяются только: вид подписи,
// соответствие настройке метода, привязка typed-подписи к реальному имени
// подписанта и корректность пути рисунка (жёсткая привязка к этапу).

export interface SignatureInput {
  kind?: unknown
  typed_name?: unknown
  drawing_path?: unknown
  metadata?: unknown
}

export interface ValidSignature {
  kind: 'typed' | 'drawn'
  typed_name: string | null
  drawing_path: string | null
  metadata: Record<string, unknown>
}

export type SignatureValidation = { error: string } | { ok: ValidSignature }

function metaOf(raw: SignatureInput): Record<string, unknown> {
  return raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as Record<string, unknown>)
    : {}
}

/**
 * Валидирует клиентский payload подписи. Возвращает { error: <apiError-код> }
 * либо { ok: ValidSignature }. Существование файла рисунка проверяется отдельно
 * (асинхронно) в маршруте.
 */
export function validateSignature(
  raw: SignatureInput | undefined | null,
  opts: { method: SignatureMethod; signerFullName: string | null; stageInstanceId: string },
): SignatureValidation {
  if (!raw || typeof raw !== 'object') return { error: 'signature_required' }

  const kind = raw.kind
  if (kind !== 'typed' && kind !== 'drawn') return { error: 'invalid_signature_kind' }

  // Настройка метода принудительно применяется на сервере (UI обойти нельзя).
  if (opts.method === 'typed' && kind !== 'typed') return { error: 'signature_kind_not_allowed' }
  if (opts.method === 'drawn' && kind !== 'drawn') return { error: 'signature_kind_not_allowed' }

  if (kind === 'typed') {
    const typed = typeof raw.typed_name === 'string' ? raw.typed_name.trim() : ''
    if (!typed) return { error: 'typed_name_required' }
    // Typed-подпись привязывается к настоящему имени подписанта.
    const full = (opts.signerFullName ?? '').trim()
    if (!full || typed.toLowerCase() !== full.toLowerCase()) return { error: 'typed_name_mismatch' }
    return { ok: { kind, typed_name: typed, drawing_path: null, metadata: metaOf(raw) } }
  }

  const path = typeof raw.drawing_path === 'string' ? raw.drawing_path : ''
  if (!path) return { error: 'drawing_required' }
  if (!isValidSignaturePath(path, opts.stageInstanceId)) return { error: 'invalid_drawing_path' }
  return { ok: { kind, typed_name: null, drawing_path: path, metadata: metaOf(raw) } }
}
