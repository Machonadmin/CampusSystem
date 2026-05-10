'use client'

import { useEffect, useRef, useState } from 'react'

interface Person {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
}

interface PersonSelectProps {
  value: string | null
  onChange: (personId: string | null, personData?: Person) => void
  placeholder?: string
  style?: React.CSSProperties
  label?: string
  required?: boolean
  disabled?: boolean
  accentColor?: string
}

const personCache = new Map<string, Person>()

export function PersonSelect({
  value,
  onChange,
  placeholder = 'Выберите или добавьте человека...',
  style,
  label,
  required = false,
  disabled,
  accentColor = '#3B82F6',
}: PersonSelectProps) {
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Person | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve person from ID when value prop changes
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.id === value) return
    const cached = personCache.get(value)
    if (cached) { setSelected(cached); return }
    fetch(`/api/persons/${value}`)
      .then(r => r.ok ? r.json() : null)
      .then((p: Person | null) => {
        if (p) { personCache.set(p.id, p); setSelected(p) }
      })
      .catch(() => {/* ignore */})
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch on open or search change
  useEffect(() => {
    if (!isOpen) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchPeople(search), search ? 250 : 0)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [search, isOpen])

  // Close on outside click
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowAdd(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  async function fetchPeople(q: string) {
    setLoading(true)
    setErrMsg('')
    try {
      const url = q.length >= 2 ? `/api/persons?search=${encodeURIComponent(q)}` : '/api/persons'
      const res = await fetch(url)
      if (res.ok) {
        const data: { people: Person[] } = await res.json()
        setPeople(data.people ?? [])
      }
    } catch {
      setErrMsg('Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  function selectPerson(p: Person) {
    personCache.set(p.id, p)
    setSelected(p)
    onChange(p.id, p)
    setIsOpen(false)
    setShowAdd(false)
    setSearch('')
  }

  function clearSelection() {
    setSelected(null)
    onChange(null)
    setSearch('')
  }

  function openDropdown() {
    if (disabled) return
    setIsOpen(true)
    setShowAdd(false)
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setErrMsg('')
    try {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: newName, phone: newPhone, email: newEmail }),
      })
      if (res.ok) {
        const created: Person = await res.json()
        selectPerson(created)
        setNewName(''); setNewPhone(''); setNewEmail('')
      } else {
        const e = await res.json()
        setErrMsg(e.error ?? 'Ошибка')
      }
    } catch {
      setErrMsg('Ошибка при добавлении')
    } finally {
      setAdding(false)
    }
  }

  const displayValue = selected ? selected.full_name : search

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
          {label}
          {required && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        <input
          value={displayValue}
          onChange={e => {
            const v = e.target.value
            setSearch(v)
            if (selected) { setSelected(null); onChange(null) }
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={openDropdown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '8px 32px 8px 10px',
            fontSize: 13,
            border: `1px solid ${selected ? '#86EFAC' : '#D1D5DB'}`,
            borderRadius: 6,
            outline: 'none',
            backgroundColor: selected ? '#F0FDF4' : '#fff',
            cursor: disabled ? 'not-allowed' : 'text',
            boxSizing: 'border-box',
          }}
        />
        {selected ? (
          <button
            type="button"
            onClick={clearSelection}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', fontSize: 18, lineHeight: 1, padding: 0,
            }}
          >×</button>
        ) : (
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            color: '#9CA3AF', fontSize: 11, pointerEvents: 'none',
          }}>▾</span>
        )}
      </div>

      {selected && (
        <div style={{ fontSize: 11, color: accentColor, marginTop: 2, paddingLeft: 2 }}>
          ✓ Связано с записью в базе
        </div>
      )}

      {isOpen && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {showAdd ? (
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
                Новый человек
              </div>
              {errMsg && (
                <div style={{
                  padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#B91C1C',
                  background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 5,
                }}>{errMsg}</div>
              )}
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ФИО *"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false) }}
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, marginBottom: 6, border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Телефон (необяз.)"
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, marginBottom: 6, border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="Email (необяз.)"
                type="email"
                style={{ width: '100%', padding: '7px 8px', fontSize: 12, marginBottom: 10, border: '1px solid #D1D5DB', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newName.trim() || adding}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
                    background: newName.trim() && !adding ? accentColor : '#E5E7EB',
                    color: newName.trim() && !adding ? '#fff' : '#9CA3AF',
                    border: 'none', borderRadius: 5,
                    cursor: newName.trim() && !adding ? 'pointer' : 'not-allowed',
                  }}
                >{adding ? 'Сохранение...' : 'Создать'}</button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setErrMsg('') }}
                  style={{ padding: '7px 12px', fontSize: 12, color: '#6B7280', background: '#F3F4F6', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                >Отмена</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>Поиск...</div>
                ) : errMsg ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#EF4444' }}>{errMsg}</div>
                ) : people.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>
                    {search.length >= 2 ? 'Ничего не найдено' : 'Нет сохранённых людей'}
                  </div>
                ) : (
                  people.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPerson(p)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '9px 12px', background: 'none', border: 'none',
                        borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                        {p.full_name}
                      </div>
                      {(p.phone || p.email) && (
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                          {p.phone ?? p.email}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowAdd(true); setNewName(search); setErrMsg('') }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 12px', fontSize: 12, fontWeight: 600,
                  color: accentColor, background: '#F9FAFB',
                  border: 'none', borderTop: '1px solid #E5E7EB', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
              >+ Добавить нового человека</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
