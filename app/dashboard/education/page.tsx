'use client'

import { useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'

const TABS = [
  { key: 'recruitment', label: 'Набор' },
  { key: 'admission',   label: 'Приём' },
  { key: 'study',       label: 'Учёба' },
] as const

type TabKey = typeof TABS[number]['key']

export default function EducationPage() {
  const [tab, setTab] = useState<TabKey>('recruitment')

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование' },
      ]} />

      <div style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Образование</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#2D3170' : '#6B7280',
              borderBottom: tab === t.key ? '2px solid #4BAED4' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              border: 'none',
              borderBottomStyle: 'solid',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        }}
      >
        <svg style={{ width: 40, height: 40, color: '#D1D5DB', margin: '0 auto 12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <p style={{ fontSize: 14, color: '#9CA3AF' }}>Раздел в разработке</p>
      </div>
    </div>
  )
}
