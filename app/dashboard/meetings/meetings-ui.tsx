'use client'

import { useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'

// ─── Общие кусочки экрана «פגישות» ───────────────────────────────────────────

export const PEOPLE_SOURCE = '/api/meetings/people'

export const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14,
}
export const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }
export const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)',
}
export const muted: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-faint)' }
export const sectionTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }

export function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? 'var(--accent-strong, var(--accent))' : 'var(--border)'}`,
    background: active ? 'var(--accent-strong, var(--accent))' : 'var(--surface)',
    color: active ? 'var(--accent-contrast, #fff)' : 'var(--text)',
  }
}

export async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, data }
}

/** Время встречи хранится как «локальное время без пояса» — берём части строки. */
export const isoDate = (iso: string | null | undefined) => (iso ?? '').slice(0, 10)
export const isoTime = (iso: string | null | undefined) => (iso ?? '').slice(11, 16)

export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface PersonRef { id: string; name: string }

/** Выбор нескольких людей: поиск + чипы с крестиком. */
export function PeoplePicker({ value, onChange, placeholder }: {
  value: PersonRef[]
  onChange: (v: PersonRef[]) => void
  placeholder: string
}) {
  const [picker, setPicker] = useState<string | null>(null)
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <PersonSelect
        value={picker}
        allowAdd={false}
        source={PEOPLE_SOURCE}
        placeholder={placeholder}
        onChange={(id, p) => {
          if (id && !value.some(x => x.id === id)) {
            onChange([...value, { id, name: (p?.hebrew_name || p?.full_name || '').trim() }])
          }
          setPicker(null)
        }}
      />
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'var(--surface-2)', fontSize: 12.5 }}>
              {p.name}
              <button type="button" aria-label="×" onClick={() => onChange(value.filter(x => x.id !== p.id))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
