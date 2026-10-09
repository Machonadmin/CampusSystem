import { isValidSignaturePath } from './signature-storage'

// ─── Валидация полезной нагрузки подписи (чистая функция) ────────────────────
//
// Решение владельца (M19, 2026-10-08): подпись — ТОЛЬКО рисунок. Печатной
// подписи («введите имя») больше нет нигде, настройки «метод подписи» тоже нет.
// Кто подписал и когда — система записывает сама (signed_by/signer_name из
// сессии, signed_at — время сервера), никогда из этого payload. Здесь
// проверяются только вид подписи и корректность пути рисунка (жёсткая
// привязка к этапу).

export interface SignatureInput {
  kind?: unknown
  drawing_path?: unknown
  metadata?: unknown
}

export interface ValidSignature {
  kind: 'drawn'
  drawing_path: string
  metadata: Record<string, unknown>
}

export type SignatureValidation = { error: string } | { ok: ValidSignature }

function metaOf(raw: SignatureInput): Record<string, unknown> {
  return raw.metadata && typeof raw.metadata === 'object'
    ? (raw.metadata as Record<string, unknown>)
    : {}
}

/**
 * Валидирует клиентский payload подписи этапа. Возвращает { error: <apiError-код> }
 * либо { ok: ValidSignature }. Существование файла рисунка проверяется отдельно
 * (асинхронно) в маршруте. Печатная подпись (kind 'typed') отвергается.
 */
export function validateSignature(
  raw: SignatureInput | undefined | null,
  opts: { stageInstanceId: string },
): SignatureValidation {
  if (!raw || typeof raw !== 'object') return { error: 'signature_required' }

  const kind = raw.kind
  if (kind === 'typed') return { error: 'signature_kind_not_allowed' }
  if (kind !== 'drawn') return { error: 'invalid_signature_kind' }

  const path = typeof raw.drawing_path === 'string' ? raw.drawing_path : ''
  if (!path) return { error: 'drawing_required' }
  if (!isValidSignaturePath(path, opts.stageInstanceId)) return { error: 'invalid_drawing_path' }
  return { ok: { kind: 'drawn', drawing_path: path, metadata: metaOf(raw) } }
}
