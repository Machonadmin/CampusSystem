'use client'

import SectionShell from '../components/SectionShell'
import RecruitmentTab from '../components/RecruitmentTab'

// גיוס как самостоятельный модуль-маршрут (см. SectionShell).
export default function RecruitmentPage() {
  return (
    <SectionShell sectionKey="recruitment" titleKey="tabs.leads">
      <RecruitmentTab />
    </SectionShell>
  )
}
