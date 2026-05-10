'use client'

import { useEffect, useRef, useState } from 'react'

interface PersonOption {
  id: string
  full_name: string
  email?: string | null
}

interface PersonSelectProps {
  value: string
  onChange: (name: string) => void
  onPersonLinked?: (person: PersonOption | null) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
  accentColor?: string
}

interface QuickAddForm {
  full_name: string
  phone: string
  email: string
}

const DEFAULT_ACCENT = '#10B981'

export function PersonSelect({
  value,
  onChange,
  onPersonLinked,
  placeholder = 'Начните вводить имя...',
  style,
  disabled,
  accentColor = DEFAULT_ACCENT,
}: PersonSelectProps) {
  const [options, setOptions] = useState<PersonOption[]>([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'add'>('list')
  const [linked, setLinked] = useState<PersonOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<QuickAddForm>({ full_name: '', phone: '', email: '' })
  const [formErr, setFormErr] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMode('list')
      }
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  async function fetchPersons(q: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/persons?q=${encodeURIComponent(q)}`)
      if (res.ok) setOptions(await res.json())
    } finally {
      setLoading(false)
    }
  }

  function handleInput(v: string) {
    onChange(v)
    if (linked) {
      setLinked(null)
      onPersonLinked?.(null)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fetchPersons(v), 250)
    setOpen(true)
    setMode('list')
  }

  function handleFocus() {
    if (!open) {
      fetchPersons(value)
      setOpen(true)
    }
  }

  function selectPerson(p: PersonOption) {
    onChange(p.full_name)
    setLinked(p)
    onPersonLinked?.(p)
    setOpen(false)
    setMode('list')
  }

  function clearSelection() {
    onChange('')
    setLinked(null)
    onPersonLinked?.(null)
    setOptions([])
    setOpen(false)
  }

  function openAdd() {
    setForm({ full_name: value, phone: '', email: '' })
    setFormErr('')
    setMode('add')
  }

  async function submitAdd() {
    if (!form.full_name.trim()) { setFormErr('Введите имя'); return }
    setSaving(true)
    setFormErr('')
    try {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        setFormErr(err.error ?? 'Ошибка')
        return
      }
      const created: PersonOption = await res.json()
      selectPerson(created)
    } finally {
      setSaving(false)
    }
  }

  const isLinked = !!linked

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '8px 32px 8px 10px',
            fontSize: 13,
            border: `1px solid ${isLinked ? '#86EFAC' : '#D1D5DB'}`,
            borderRadius: 6,
            outline: 'none',
            backgroundColor: isLinked ? '#F0FDF4' : '#fff',
            boxSizing: 'border-box',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={clearSelection}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
              fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >×</button>
        ) : (
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            color: '#9CA3AF', fontSize: 11, pointerEvents: 'none',
          }}>▾</span>
        )}
      </div>

      {isLinked && (
        <div style={{ fontSize: 11, color: accentColor, marginTop: 2, paddingLeft: 2 }}>
          ✓ Связано с записью в базе
        </div>
      )}

      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {mode === 'list' ? (
            <>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>Поиск...</div>
                ) : options.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>
                    {value.length >= 2 ? 'Ничего не найдено' : 'Введите имя для поиска'}
                  </div>
                ) : (
                  options.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPerson(p)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', fontSize: 13, background: 'none', border: 'none',
                        cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                        color: '#111827',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{p.full_name}</div>
                      {p.email && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.email}</div>}
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={openAdd}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  color: accentColor, background: '#F9FAFB', border: 'none',
                  borderTop: '1px solid #E5E7EB', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
              >
                + Добавить нового человека
              </button>
            </>
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                Новый человек
              </div>
              <input
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Полное имя *"
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 6,
                  border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Телефон (необяз.)"
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 6,
                  border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <input
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email (необяз.)"
                type="email"
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 8,
                  border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {formErr && (
                <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 6 }}>{formErr}</div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={submitAdd}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                    color: '#fff', background: accentColor, border: 'none',
                    borderRadius: 5, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Сохранение...' : 'Создать'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  style={{
                    padding: '6px 12px', fontSize: 12, color: '#6B7280',
                    background: '#F3F4F6', border: 'none', borderRadius: 5, cursor: 'pointer',
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
