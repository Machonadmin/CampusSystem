'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CascadeValue {
  department_id: string | null
  direction_id: string | null
  level_id: string | null
  free_text: string | null
}

interface Institution { id: string; name: string }
interface Direction { id: string; name_ru: string; code: string | null; has_levels: boolean; sort_order: number }
interface Level { id: string; name_ru: string; sort_order: number }

interface Props {
  value: CascadeValue
  onChange: (value: CascadeValue) => void
  disabled?: boolean
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CascadeDirectionSelector({ value, onChange, disabled = false }: Props) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [directions, setDirections] = useState<Direction[] | null>(null)
  const [levels, setLevels] = useState<Level[] | null>(null)
  const [loadingDirections, setLoadingDirections] = useState(false)

  // Загрузка списка учреждений (один раз)
  useEffect(() => {
    let cancelled = false
    fetch('/api/education/institutions')
      .then(r => r.ok ? r.json() : { institutions: [] })
      .then((d: { institutions?: Institution[] }) => { if (!cancelled) setInstitutions(d.institutions ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Загрузка направлений при выборе учреждения
  useEffect(() => {
    if (!value.department_id) { setDirections(null); return }
    let cancelled = false
    setLoadingDirections(true)
    fetch(`/api/education/directions?department_id=${value.department_id}`)
      .then(r => r.ok ? r.json() : { directions: [] })
      .then((d: { directions?: Direction[] }) => { if (!cancelled) setDirections(d.directions ?? []) })
      .catch(() => { if (!cancelled) setDirections([]) })
      .finally(() => { if (!cancelled) setLoadingDirections(false) })
    return () => { cancelled = true }
  }, [value.department_id])

  // Выбранное направление (из загруженного списка) — нужно для has_levels
  const selectedDirection = (directions ?? []).find(d => d.id === value.direction_id) ?? null

  // Загрузка уровней, если у направления они есть
  useEffect(() => {
    if (!value.direction_id || !selectedDirection?.has_levels) { setLevels(null); return }
    let cancelled = false
    fetch(`/api/education/levels?direction_id=${value.direction_id}`)
      .then(r => r.ok ? r.json() : { levels: [] })
      .then((d: { levels?: Level[] }) => { if (!cancelled) setLevels(d.levels ?? []) })
      .catch(() => { if (!cancelled) setLevels([]) })
    return () => { cancelled = true }
  }, [value.direction_id, selectedDirection?.has_levels])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleInstitution(deptId: string) {
    onChange({ department_id: deptId || null, direction_id: null, level_id: null, free_text: null })
  }
  function handleDirection(dirId: string) {
    onChange({ ...value, direction_id: dirId || null, level_id: null, free_text: null })
  }
  function handleLevel(levelId: string) {
    onChange({ ...value, level_id: levelId || null })
  }
  function handleFreeText(text: string) {
    onChange({ ...value, free_text: text })
  }

  // ── Render logic ──────────────────────────────────────────────────────────────

  // textarea показываем, когда:
  //  - учреждение выбрано, но направлений нет (пустой справочник), ИЛИ
  //  - учреждение не выбрано, но есть легаси free_text
  const showFreeText =
    (value.department_id != null && directions != null && directions.length === 0) ||
    (value.department_id == null && value.free_text != null)

  const showDirections =
    value.department_id != null && directions != null && directions.length > 0

  const showLevels =
    showDirections && selectedDirection?.has_levels === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {/* Three selects in a horizontal grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
        {/* Учреждение */}
        <div>
          <label style={lbl}>Учреждение</label>
          <select
            value={value.department_id ?? ''}
            onChange={e => handleInstitution(e.target.value)}
            disabled={disabled}
            style={{ ...inp, color: value.department_id ? '#111827' : '#9CA3AF' }}
          >
            <option value="">— выберите учреждение —</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        {/* Направление */}
        {loadingDirections ? (
          <div style={{ fontSize: 12, color: '#9CA3AF', paddingBottom: 8 }}>Загрузка направлений…</div>
        ) : showDirections ? (
          <div>
            <label style={lbl}>Направление</label>
            <select
              value={value.direction_id ?? ''}
              onChange={e => handleDirection(e.target.value)}
              disabled={disabled}
              style={{ ...inp, color: value.direction_id ? '#111827' : '#9CA3AF' }}
            >
              <option value="">— выберите направление —</option>
              {directions!.map(d => <option key={d.id} value={d.id}>{d.name_ru}</option>)}
            </select>
          </div>
        ) : null}

        {/* Уровень / Курс */}
        {showLevels ? (
          <div>
            <label style={lbl}>Уровень / Курс</label>
            <select
              value={value.level_id ?? ''}
              onChange={e => handleLevel(e.target.value)}
              disabled={disabled}
              style={{ ...inp, color: value.level_id ? '#111827' : '#9CA3AF' }}
            >
              <option value="">— выберите уровень —</option>
              {(levels ?? []).map(l => <option key={l.id} value={l.id}>{l.name_ru}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      {/* Свободный текст (учреждение без справочника / легаси) — на всю ширину */}
      {showFreeText && (
        <div>
          <label style={lbl}>Опишите направление</label>
          <textarea
            value={value.free_text ?? ''}
            onChange={e => handleFreeText(e.target.value)}
            disabled={disabled}
            placeholder="Направление обучения свободным текстом…"
            rows={2}
            style={{ ...inp, resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  )
}
