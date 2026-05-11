'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import SubTabs from '@/components/ui/SubTabs'

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
      <SubTabs
        tabs={SUB_TABS.map(t => ({ key: t.code, label: t.label }))}
        active={active}
        onChange={k => setActive(k as SubTab)}
        accentColor={accent}
      />

      {/* Содержимое */}
      <div style={{ padding: 20 }}>
        {active === 'subjects' && <SubjectsTab />}
        {active === 'specialties' && <SpecialtiesTab />}
        {active !== 'subjects' && active !== 'specialties' && (
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
