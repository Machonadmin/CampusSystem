'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import StudentsTab from './StudentsTab'
import ClassGroupsTab from './ClassGroupsTab'
import SubTabs from '@/components/ui/SubTabs'

type SubTab = 'subjects' | 'specialties' | 'study_groups' | 'students' | 'class_groups'

const SUB_TAB_CODES: SubTab[] = ['subjects', 'specialties', 'study_groups', 'students', 'class_groups']

const accent = getModuleColor('education')

export default function StudyTab() {
  const t = useTranslations('education')
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
        tabs={SUB_TAB_CODES.map(code => ({ key: code, label: t(`study.tabs.${code}`) }))}
        active={active}
        onChange={k => setActive(k as SubTab)}
        accentColor={accent}
      />

      {/* Содержимое */}
      <div style={{ padding: 20 }}>
        {active === 'subjects' && <SubjectsTab />}
        {active === 'specialties' && <SpecialtiesTab />}
        {active === 'study_groups' && <StudyGroupsTab />}
        {active === 'students' && <StudentsTab />}
        {active === 'class_groups' && <ClassGroupsTab />}
      </div>
    </div>
  )
}
