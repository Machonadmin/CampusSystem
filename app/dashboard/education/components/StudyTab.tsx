'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import SubjectsTab from './SubjectsTab'

type SubTab = 'subjects' | 'specialties' | 'study_groups' | 'students' | 'class_groups'

const SUB_TABS: { code: SubTab; label: string }[] = [
  { code: 'subjects',     label: 'Предметы' },
  { code: 'specialties',  label: 'Специальности' },
  { code: 'study_groups', label: 'Базовые группы' },
  { code: 'students',     label: 'Студенты' },
  { code: 'class_groups', label: 'Учебные группы' },
]

const accent = getModuleColor('education')

export default function StudyTab() {
  const [active, setActive] = useState<SubTab>('subjects')

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid #E5E7EB',
      overflow: 'hidden',
    }}>
      {/* Полоса подвкладок */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #E5E7EB',
        background: '#F9FAFB',
      }}>
        {SUB_TABS.map(t => {
          const isActive = t.code === active
          return (
            <button
              key={t.code}
              onClick={() => setActive(t.code)}
              style={{
                padding: '11px 20px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? accent : '#6B7280',
                background: isActive ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Содержимое */}
      <div style={{ padding: 20 }}>
        {active === 'subjects' && <SubjectsTab />}
        {active !== 'subjects' && (
          <div style={{
            textAlign: 'center',
            padding: '64px 24px',
            color: '#6B7280',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>В разработке</div>
            <div style={{ fontSize: 13 }}>Эта подвкладка появится в ближайшее время.</div>
          </div>
        )}
      </div>
    </div>
  )
}
