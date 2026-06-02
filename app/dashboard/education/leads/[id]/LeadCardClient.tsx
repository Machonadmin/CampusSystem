'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'
import ProcessInfoBlock from '@/components/workflow/ProcessInfoBlock'

interface Props {
  journeyId: string
  personName: string
}

export default function LeadCardClient({ journeyId, personName }: Props) {
  const router = useRouter()
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование', href: '/dashboard/education' },
        { label: 'Набор', href: '/dashboard/education' },
        { label: personName },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12,
        padding: '16px 24px',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(16,185,129,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{personName}</h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Карточка лида</div>
          </div>
          <button
            onClick={() => router.push('/dashboard/education')}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.2)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ← К списку
          </button>
        </div>
      </div>

      {savedAt && (
        <div style={{
          background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8,
          padding: '10px 16px', fontSize: 13, color: '#065F46',
        }}>
          Данные сохранены
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 350px',
        gap: 20,
        alignItems: 'start',
      }}>
        <EducationJourneyForm
          mode="lead"
          inline
          journeyId={journeyId}
          onClose={() => router.push('/dashboard/education')}
          onSaved={() => setSavedAt(new Date())}
        />
        <ProcessInfoBlock journeyId={journeyId} />
      </div>
    </div>
  )
}
