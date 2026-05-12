'use client'

import { PersonSelect } from './person-select'

export type RelationType =
  | 'mother' | 'father' | 'parent'
  | 'spouse' | 'child' | 'sibling' | 'grandparent'
  | 'guardian'
  | 'community_contact' | 'emergency_contact'
  | 'other'

export const RELATION_LABELS: Record<RelationType, string> = {
  mother: 'Мать',
  father: 'Отец',
  parent: 'Родитель',
  spouse: 'Супруг(а)',
  child: 'Ребёнок',
  sibling: 'Брат/Сестра',
  grandparent: 'Бабушка/Дедушка',
  guardian: 'Опекун',
  community_contact: 'Контакт общины',
  emergency_contact: 'Экстренный контакт',
  other: 'Другое',
}

export interface PersonRelationValue {
  relative_id: string | null
  relative_name?: string | null
  relation_type: RelationType
  notes: string | null
}

interface Props {
  value: PersonRelationValue
  onChange: (value: PersonRelationValue) => void
  onRemove?: () => void
  showRemove?: boolean
  fixedRelationType?: RelationType
  label?: string
  accentColor?: string
  availableRelations?: RelationType[]
}

export default function PersonRelationField({
  value, onChange, onRemove, showRemove = false,
  fixedRelationType, label, accentColor = '#3B82F6',
  availableRelations,
}: Props) {
  const relations = availableRelations ?? (Object.keys(RELATION_LABELS) as RelationType[])

  const lbl: React.CSSProperties = {
    fontSize: 12, color: '#6B7280', marginBottom: 4, display: 'block',
  }
  const ctrl: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none',
    boxSizing: 'border-box', background: '#fff',
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
      padding: 10, paddingRight: showRemove && onRemove ? 32 : 10,
      background: '#FAFAFA', borderRadius: 8, border: '1px solid #E5E7EB',
    }}>
      {!fixedRelationType && (
        <div style={{ minWidth: 140 }}>
          <label style={lbl}>Тип отношения</label>
          <select
            value={value.relation_type}
            onChange={(e) => onChange({ ...value, relation_type: e.target.value as RelationType })}
            style={ctrl}
          >
            {relations.map(rt => (
              <option key={rt} value={rt}>{RELATION_LABELS[rt]}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 240 }}>
        {label && <label style={lbl}>{label}</label>}
        <PersonSelect
          value={value.relative_id}
          onChange={(personId, personData) => onChange({
            ...value,
            relative_id: personId,
            relative_name: personData?.full_name ?? null,
          })}
          placeholder="Выберите или добавьте человека"
          accentColor={accentColor}
        />
      </div>

      <div style={{ width: '100%' }}>
        <input
          type="text"
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value || null })}
          placeholder="Заметки (опц.)"
          style={{ ...ctrl, fontSize: 12, padding: '6px 10px', color: '#374151' }}
        />
      </div>

      {showRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, fontSize: 14,
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4,
            cursor: 'pointer', color: '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, lineHeight: 1,
          }}
          aria-label="Удалить"
        >
          ×
        </button>
      )}
    </div>
  )
}
