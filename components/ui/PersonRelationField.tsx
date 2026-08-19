'use client'

import { PersonSelect } from './person-select'
import { useTranslations } from '@/lib/i18n/LanguageContext'

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
  fixedRelationType, label, accentColor = 'var(--accent)',
  availableRelations,
}: Props) {
  const t = useTranslations('persons')
  const relations = availableRelations ?? (Object.keys(RELATION_LABELS) as RelationType[])

  const lbl: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block',
  }
  const ctrl: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 6, outline: 'none',
    boxSizing: 'border-box', background: 'var(--surface)',
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
      padding: 10, paddingRight: showRemove && onRemove ? 32 : 10,
      background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)',
    }}>
      {!fixedRelationType && (
        <div style={{ minWidth: 140 }}>
          <label style={lbl}>{t('relation_type_label')}</label>
          <select
            value={value.relation_type}
            onChange={(e) => onChange({ ...value, relation_type: e.target.value as RelationType })}
            style={ctrl}
          >
            {relations.map(rt => (
              <option key={rt} value={rt}>{t(`relation_${rt}`)}</option>
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
          placeholder={t('select_or_add_short')}
          accentColor={accentColor}
        />
      </div>

      <div style={{ width: '100%' }}>
        <input
          type="text"
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value || null })}
          placeholder={t('notes_placeholder')}
          style={{ ...ctrl, fontSize: 12, padding: '6px 10px', color: 'var(--text)' }}
        />
      </div>

      {showRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, fontSize: 14,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
            cursor: 'pointer', color: 'var(--text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, lineHeight: 1,
          }}
          aria-label={t('remove')}
        >
          ×
        </button>
      )}
    </div>
  )
}
