'use client'

import { useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Teacher {
  person_id: string
  full_name: string | null
  is_primary: boolean
}

interface Props {
  groupId: string
  departmentId?: string | null
  teachers: Teacher[]
  onChange: () => void
  accentColor: string
}

export default function ClassGroupTeachers({ groupId, departmentId, teachers, onChange, accentColor }: Props) {
  const t = useTranslations('education.study')
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
        setActionError(err.error ?? `${t('common.error_generic')} ${resp.status}`)
        return
      }
      setAdding(false)
      setSelectedId(null)
      onChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('common.error_generic'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (personId: string) => {
    if (!confirm(t('class_groups.remove_teacher_confirm'))) return
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/teachers/${personId}`, {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('common.error_generic'))
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.error_generic'))
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
        alert(err.error ?? t('common.error_generic'))
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.error_generic'))
    }
  }

  const btnSmall: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {t('class_groups.teachers_section_title')}
        </h2>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setActionError(null) }}
            style={{ ...btnSmall, color: accentColor, borderColor: accentColor }}
          >
            {t('class_groups.add_teacher_button')}
          </button>
        )}
      </div>

      {/* Форма добавления */}
      {adding && (
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <PersonSelect
              value={selectedId}
              onChange={id => setSelectedId(id)}
              placeholder={t('class_groups.teacher_select_placeholder')}
              accentColor={accentColor}
              roleFilter="teacher"
              allowShowAll
              {...(departmentId ? {
                enrollOption: {
                  label: t('class_groups.enroll_as_teacher_label'),
                  departmentId,
                  defaultChecked: true,
                },
              } : {})}
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
              {saving ? t('common.saving') : t('class_groups.add_confirm_button')}
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedId(null); setActionError(null) }}
              disabled={saving}
              style={btnSmall}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Список */}
      {teachers.length === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('class_groups.no_teachers')}</div>
      ) : (
        <div>
          {teachers.map((tc, i) => (
            <div
              key={tc.person_id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {tc.full_name ?? '—'}
                </span>
                {tc.is_primary && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                    background: `${accentColor}18`, color: accentColor,
                  }}>
                    {t('class_groups.primary_badge')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!tc.is_primary && (
                  <button onClick={() => handleSetPrimary(tc.person_id)} style={btnSmall}>
                    {t('class_groups.make_primary_button')}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(tc.person_id)}
                  style={{ ...btnSmall, color: '#DC2626', borderColor: '#FCA5A5' }}
                >
                  {t('class_groups.remove_button')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
