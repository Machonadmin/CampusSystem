'use client'

import SectionShell from '../components/SectionShell'
import AcceptanceOverviewTab from '../components/AcceptanceOverviewTab'

// קבלה (приёмная комиссия) как самостоятельный модуль-маршрут.
export default function AdmissionPage() {
  return (
    <SectionShell sectionKey="committee" titleKey="tabs.applicants">
      <AcceptanceOverviewTab />
    </SectionShell>
  )
}
