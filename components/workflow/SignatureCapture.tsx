'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export type SignatureMethod = 'typed' | 'drawn' | 'both'

export interface SignaturePayload {
  kind: 'typed' | 'drawn'
  typed_name?: string
  drawing_blob?: Blob
}

interface Props {
  method: SignatureMethod
  defaultTypedName?: string
  /** Emits the current signature, or null when incomplete/invalid. */
  onChange: (payload: SignaturePayload | null) => void
}

/**
 * Reusable signature capture. Presentational only — it never touches identity;
 * the signer is derived server-side. Emits a typed name or a drawn PNG Blob.
 */
export default function SignatureCapture({ method, defaultTypedName, onChange }: Props) {
  const t = useTranslations('education')
  const [mode, setMode] = useState<'typed' | 'drawn'>(method === 'drawn' ? 'drawn' : 'typed')
  const [typedName, setTypedName] = useState(defaultTypedName ?? '')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const hasDrawn = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Emit typed changes.
  useEffect(() => {
    if (mode !== 'typed') return
    const name = typedName.trim()
    onChange(name ? { kind: 'typed', typed_name: name } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedName, mode])

  // Prefill with the signer's registered name once it arrives (e.g. async
  // /api/auth/me), only while the field is still empty. Runs only when
  // defaultTypedName changes, so it never refills after the user clears it.
  useEffect(() => {
    if (defaultTypedName && !typedName) setTypedName(defaultTypedName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTypedName])

  // Prime the canvas with a white background whenever we enter draw mode.
  useEffect(() => {
    if (mode !== 'drawn') return
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    hasDrawn.current = false
  }, [mode])

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
    ctx.strokeStyle = 'var(--text)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
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
  function switchMode(m: 'typed' | 'drawn') {
    setMode(m)
    if (m === 'typed') {
      const n = typedName.trim()
      onChange(n ? { kind: 'typed', typed_name: n } : null)
    } else {
      onChange(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {method === 'both' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => switchMode('typed')} style={tab(mode === 'typed')}>
            {t('process.signature.method.typed')}
          </button>
          <button type="button" onClick={() => switchMode('drawn')} style={tab(mode === 'drawn')}>
            {t('process.signature.method.drawn')}
          </button>
        </div>
      )}

      {mode === 'typed' ? (
        <input
          value={typedName}
          onChange={e => setTypedName(e.target.value)}
          placeholder={t('process.signature.typed_placeholder')}
          style={{ fontSize: 14, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%' }}
        />
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('process.signature.draw_hint')}</div>
          <canvas
            ref={canvasRef}
            width={480}
            height={150}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            style={{ width: '100%', height: 150, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', touchAction: 'none', cursor: 'crosshair' }}
          />
          <button type="button" onClick={clear} style={{ justifySelf: 'start', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {t('process.signature.clear')}
          </button>
        </div>
      )}
    </div>
  )
}

function tab(active: boolean): React.CSSProperties {
  return {
    fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
    background: active ? '#EEF0FE' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
  }
}
