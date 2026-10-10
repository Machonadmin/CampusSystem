import { isScreenshotMime } from './validation'

// ─── Сжатие скриншотов в браузере перед отправкой ────────────────────────────
//
// Снимок экрана телефона в PNG весит 1–3 МБ, и его приходилось везти целиком:
// с телефона на сервер Vercel и оттуда в Supabase Storage. Перед отправкой
// форма (components/dashboard/FeedbackModal.tsx) уменьшает картинку до
// SHRINK_MAX_SIDE по длинной стороне и пересохраняет в JPEG — обычно это
// 150–400 КБ, текст на снимке остаётся читаемым. Если сжать не вышло
// (браузер не умеет, формат не декодируется) — уходит оригинал.

/** Длинная сторона после сжатия: экран телефона 1080×2400 → 864×1920. */
export const SHRINK_MAX_SIDE = 1920
export const SHRINK_QUALITY = 0.85
/** Небольшие картинки допустимого типа и размера не трогаем. */
export const SHRINK_SKIP_BELOW_BYTES = 200 * 1024

/** Размер после уменьшения: пропорционально, длинная сторона ≤ maxSide. */
export function shrinkSize(width: number, height: number, maxSide = SHRINK_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Имя файла после пересохранения в JPEG: «Screenshot 1.png» → «Screenshot 1.jpg». */
export function shrunkName(name: string): string {
  const base = (name || 'screenshot').replace(/\.[^./\\]*$/, '')
  return `${base || 'screenshot'}.jpg`
}

/** Уменьшает и пересохраняет картинку в JPEG; при любой неудаче — оригинал. */
export async function shrinkScreenshot(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const target = shrinkSize(bitmap.width, bitmap.height)
    const alreadySmall = target.width === bitmap.width && target.height === bitmap.height
    if (alreadySmall && file.size <= SHRINK_SKIP_BELOW_BYTES && isScreenshotMime(file.type)) return file

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // У JPEG нет прозрачности — подкладываем белый фон, иначе прозрачное станет чёрным.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, target.width, target.height)
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', SHRINK_QUALITY))
    if (!blob || blob.type !== 'image/jpeg') return file
    // Сжатие не помогло, а оригинал и так подходит — оставляем оригинал.
    if (blob.size >= file.size && isScreenshotMime(file.type)) return file
    return new File([blob], shrunkName(file.name), { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
