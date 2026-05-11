'use client'

import { useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'

interface Teacher {
  person_id: string
  full_name: string | null
  is_primary: boolean
}

interface Props {
  groupId: string
  teachers: Teacher[]
  onChange: () => void
  accentColor: string
}

export default function ClassGroupTeachers({ groupId, teachers, onChange, accentColor }: Props) {
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!selectedId) return
    setSaving(true)
    setActionError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_ids: [selectedId] }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setActionError(err.error ?? `Ошибка ${resp.status}`)
        return
      }
      setAdding(false)
      setSelectedId(null)
      onChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (personId: string) => {
    if (!confirm('Снять преподавателя с группы?')) return
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/teachers/${personId}`, {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Ошибка')
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const handleSetPrimary = async (personId: string) => {
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/teachers/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Ошибка')
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const btnSmall: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>
          Преподаватели
        </h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setActionError(null) }}
            style={{ ...btnSmall, color: accentColor, borderColor: accentColor }}
          >
            + Добавить
          </button>
        )}
      </div>

      {/* Форма добавления */}
      {adding && (
        <div style={{ marginBottom: 14, padding: 12, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <div style={{ marginBottom: 8 }}>
            <PersonSelect
              value={selectedId}
              onChange={id => setSelectedId(id)}
              placeholder="Выберите или создайте преподавателя…"
              accentColor={accentColor}
            />
          </div>
          {actionError && (
            <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 8 }}>{actionError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAdd}
              disabled={!selectedId || saving}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500, color: '#fff',
                background: accentColor, border: 'none', borderRadius: 6,
                cursor: (!selectedId || saving) ? 'not-allowed' : 'pointer',
                opacity: (!selectedId || saving) ? 0.6 : 1,
              }}
            >
              {saving ? 'Сохранение…' : 'Добавить'}
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedId(null); setActionError(null) }}
              disabled={saving}
              style={btnSmall}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Список */}
      {teachers.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>Преподаватели не назначены</div>
      ) : (
        <div>
          {teachers.map((t, i) => (
            <div
              key={t.person_id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderTop: i > 0 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>
                  {t.full_name ?? '—'}
                </span>
                {t.is_primary && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                    background: `${accentColor}18`, color: accentColor,
                  }}>
                    Основной
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!t.is_primary && (
                  <button onClick={() => handleSetPrimary(t.person_id)} style={btnSmall}>
                    Сделать основным
                  </button>
                )}
                <button
                  onClick={() => handleRemove(t.person_id)}
                  style={{ ...btnSmall, color: '#DC2626', borderColor: '#FCA5A5' }}
                >
                  Снять
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
