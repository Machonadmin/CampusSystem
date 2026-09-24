'use client'

import SectionShell from '../components/SectionShell'
import StudyTab from '../components/StudyTab'

// לימודים как самостоятельный модуль-маршрут.
export default function StudiesPage() {
  return (
    <SectionShell sectionKey="study" titleKey="tabs.students">
      <StudyTab />
    </SectionShell>
  )
}
