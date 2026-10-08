'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export interface SignaturePayload {
  kind: 'drawn'
  drawing_blob: Blob
}

interface Props {
  /** Name of the logged-in signer, shown for information only. */
  signerName?: string | null
  /** Emits the current drawing, or null when nothing is drawn yet. */
  onChange: (payload: SignaturePayload | null) => void
}

/**
 * Reusable signature pad. Signing = drawing (owner decision M19): there is no
 * typed-name option. Presentational only — it never sends identity; the server
 * records who signed (the logged-in user) and when. The signer's name is shown
 * so the person sees in whose name the signature will be recorded.
 */
export default function SignatureCapture({ signerName, onChange }: Props) {
  const t = useTranslations('education')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Prime the canvas with a white background (the PNG is shown on light paper/receipts).
  useEffect(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    hasDrawn.current = false
  }, [])

  const emitDrawn = useCallback(() => {
    const c = canvasRef.current
    if (!c || !hasDrawn.current) { onChange(null); return }
    c.toBlob(blob => onChange(blob ? { kind: 'drawn', drawing_blob: blob } : null), 'image/png')
  }, [onChange])

  function coords(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = coords(e)
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = coords(e)
    const l = last.current ?? p
    // Canvas does not resolve CSS variables — use a fixed ink colour on the white pad.
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p
    hasDrawn.current = true
  }
  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    emitDrawn()
  }
  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
    hasDrawn.current = false
    onChange(null)
  }

  const name = (signerName ?? '').trim()

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {name && (
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {t('process.signature.signer').replace('{name}', name)}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('process.signature.draw_hint')}</div>
      <canvas
        ref={canvasRef}
        width={480}
        height={150}
        aria-label={t('process.signature.title')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: '100%', maxWidth: 480, height: 150, border: '1px solid var(--border-strong)', borderRadius: 8, background: '#ffffff', touchAction: 'none', cursor: 'crosshair' }}
      />
      <button type="button" onClick={clear} style={{ justifySelf: 'start', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {t('process.signature.clear')}
      </button>
    </div>
  )
}
