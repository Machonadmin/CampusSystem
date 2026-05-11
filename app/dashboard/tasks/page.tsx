'use client'

import { getModuleHeaderGradient } from '@/lib/module-colors'

export default function TasksPage() {
  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('tasks'),
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(245,158,11,0.2)',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Задачи</h1>
      </div>

      {/* Placeholder */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: 10,
        border: '1px solid #E5E7EB',
        padding: '64px 24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 20, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
          Модуль в разработке
        </p>
        <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
          Здесь будет список задач, форма создания и управление сериями.
        </p>
      </div>
    </div>
  )
}
