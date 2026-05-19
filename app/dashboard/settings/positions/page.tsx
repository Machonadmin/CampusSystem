'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import type { PositionCategory, ReferencePositionRow } from '@/types/database'

const accent = getModuleColor('settings')

const CATEGORY_LABELS: Record<PositionCategory, string> = {
  academic:       'Преподавательская',
  administrative: 'Управленческая',
  support:        'Вспомогательная',
}
const CATEGORY_COLORS: Record<PositionCategory, { bg: string; fg: string }> = {
  academic:       { bg: '#EEF2FF', fg: '#3730A3' },
  administrative: { bg: '#FEF3C7', fg: '#92400E' },
  support:        { bg: '#F0FDF4', fg: '#166534' },
}

interface ModalState {
  mode: 'create' | 'edit'
  item: ReferencePositionRow | null
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<ReferencePositionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterCategory, setFilterCategory] = useState<PositionCategory | ''>('')
  const [showInactive, setShowInactive] = useState(false)

  const [modal, setModal] = useState<ModalState | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterCategory) params.set('category', filterCategory)
      params.set('active_only', showInactive ? 'false' : 'true')
      const resp = await fetch(`/api/settings/positions?${params}`)
      if (!resp.ok) throw new Error(`Ошибка загрузки: ${resp.status}`)
      const json = await resp.json()
      setPositions(json.positions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }, [filterCategory, showInactive])

  useEffect(() => { loadData() }, [loadData])

  const handleDeactivate = async (pos: ReferencePositionRow) => {
    if (!confirm(`Деактивировать должность «${pos.name_ru}»?`)) return
    try {
      const resp = await fetch(`/api/settings/positions/${pos.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Ошибка')
        return
      }
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const handleRestore = async (pos: ReferencePositionRow) => {
    try {
      const resp = await fetch(`/api/settings/positions/${pos.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Ошибка')
        return
      }
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none',
  }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Настройки', href: '/dashboard/settings' },
        { label: 'Справочник должностей' },
      ]} />

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('settings'),
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(30,64,175,0.2)',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
          Справочник должностей
        </h1>
      </div>

      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as PositionCategory | '')} style={inp}>
          <option value="">Все категории</option>
          <option value="academic">Преподавательские</option>
          <option value="administrative">Управленческие</option>
          <option value="support">Вспомогательные</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Показать неактивные
        </label>

        <div style={{ flex: 1 }} />

        <PageActionButton
          label="Добавить должность"
          onClick={() => setModal({ mode: 'create', item: null })}
          accentColor={accent}
        />
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>
      )}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        positions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {filterCategory ? 'Ничего не найдено' : 'Должностей пока нет'}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>Должность</th>
                  <th style={thStyle}>Иврит</th>
                  <th style={thStyle}>Категория</th>
                  <th style={{ ...thStyle, width: 110, textAlign: 'center' }}>Преподавательская</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Порядок</th>
                  <th style={{ ...thStyle, width: 100 }}>Статус</th>
                  <th style={{ ...thStyle, width: 200 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => {
                  const catStyle = CATEGORY_COLORS[pos.category]
                  return (
                    <tr
                      key={pos.id}
                      style={{ borderTop: '1px solid #F3F4F6', opacity: pos.is_active ? 1 : 0.55 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{pos.name_ru}</td>
                      <td style={{ ...tdStyle, color: '#6B7280', direction: 'rtl' }}>
                        {pos.name_he ?? <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                          background: catStyle.bg, color: catStyle.fg,
                        }}>
                          {CATEGORY_LABELS[pos.category]}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {pos.is_teaching
                          ? <span style={{ color: '#10B981', fontWeight: 500 }}>Да</span>
                          : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#9CA3AF' }}>
                        {pos.sort_order}
                      </td>
                      <td style={tdStyle}>
                        {pos.is_active
                          ? <span style={{ color: '#10B981', fontWeight: 500 }}>Активна</span>
                          : <span style={{ color: '#9CA3AF' }}>Неактивна</span>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => setModal({ mode: 'edit', item: pos })} style={btnSecondary}>
                            Изменить
                          </button>
                          {pos.is_active ? (
                            <button
                              onClick={() => handleDeactivate(pos)}
                              style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}
                            >
                              Деактивировать
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRestore(pos)}
                              style={{ ...btnSecondary, color: '#059669', borderColor: '#6EE7B7' }}
                            >
                              Восстановить
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modal && (
        <PositionModal
          mode={modal.mode}
          initial={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'create' | 'edit'
  initial: ReferencePositionRow | null
  onClose: () => void
  onSaved: () => void
}

function PositionModal({ mode, initial, onClose, onSaved }: ModalProps) {
  const [nameRu, setNameRu] = useState(initial?.name_ru ?? '')
  const [nameHe, setNameHe] = useState(initial?.name_he ?? '')
  const [category, setCategory] = useState<PositionCategory>(initial?.category ?? 'academic')
  const [isTeaching, setIsTeaching] = useState(initial?.is_teaching ?? false)
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 100))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (category !== 'academic') setIsTeaching(false)
  }, [category])

  const handleSubmit = async () => {
    const trimmed = nameRu.trim()
    if (!trimmed) { setError('Название обязательно'); return }

    setSaving(true)
    setError(null)
    try {
      const body = {
        name_ru: trimmed,
        name_he: nameHe.trim() || null,
        category,
        is_teaching: isTeaching,
        sort_order: Number(sortOrder) || 100,
      }

      const url = mode === 'edit' && initial ? `/api/settings/positions/${initial.id}` : '/api/settings/positions'
      const method = mode === 'edit' ? 'PATCH' : 'POST'

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Ошибка сохранения')
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)', position: 'relative',
        }}
      >
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16,
          background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1,
        }}>×</button>

        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px 0', color: '#111827' }}>
          {mode === 'create' ? 'Новая должность' : 'Редактировать должность'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Название (русский) *</label>
            <input value={nameRu} onChange={e => setNameRu(e.target.value)} placeholder="Преподаватель" style={inp} />
          </div>

          <div>
            <label style={lbl}>Название (иврит)</label>
            <input value={nameHe} onChange={e => setNameHe(e.target.value)} placeholder="מורה" dir="rtl" style={inp} />
          </div>

          <div>
            <label style={lbl}>Категория *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['academic', 'administrative', 'support'] as PositionCategory[]).map(cat => (
                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="category" checked={category === cat} onChange={() => setCategory(cat)} />
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                    background: CATEGORY_COLORS[cat].bg, color: CATEGORY_COLORS[cat].fg,
                  }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
            opacity: category !== 'academic' ? 0.4 : 1,
            userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={isTeaching}
              disabled={category !== 'academic'}
              onChange={e => setIsTeaching(e.target.checked)}
            />
            Преподавательская должность
            {category !== 'academic' && (
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>(только для «Преподавательской»)</span>
            )}
          </label>

          <div>
            <label style={lbl}>Порядок сортировки</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inp, width: 100 }} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 10, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', fontSize: 13, color: '#6B7280',
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer',
          }}>
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
              background: accent, border: 'none', borderRadius: 8,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Сохранение…' : mode === 'create' ? 'Добавить' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: '#374151',
  textAlign: 'left', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: '#1F2937' }
