'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'

interface StageTemplateInfo {
  id: string
  code: string
  name_ru: string
  sort_order: number
}

interface StageInstanceInfo {
  id: string
  status: 'waiting' | 'active' | 'completed' | 'skipped' | 'cancelled'
  final_code: string | null
  activated_at: string | null
  completed_at: string | null
  stage_template: StageTemplateInfo | null
}

interface ProcessTemplateInfo {
  id: string
  code: string
  name_ru: string
}

interface ProcessInfo {
  id: string
  status: 'active' | 'completed' | 'cancelled'
  started_at: string
  finished_at: string | null
  finish_reason: string | null
  template: ProcessTemplateInfo | null
  stages: StageInstanceInfo[]
}

interface Props {
  journeyId: string
}

export default function ProcessInfoBlock({ journeyId }: Props) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const accent = getModuleColor('education')

  useEffect(() => {
    fetch(`/api/workflow/journeys/${journeyId}/processes`)
      .then(r => r.ok ? r.json() : { processes: [] })
      .then((d: { processes?: ProcessInfo[] }) => setProcesses(d.processes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [journeyId])

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', color: '#9CA3AF', fontSize: 13 }}>
        Загрузка процессов…
      </div>
    )
  }

  if (processes.length === 0) {
    return (
      <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', color: '#9CA3AF', fontSize: 13 }}>
        Процессы не запущены
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {processes.map(proc => (
        <div key={proc.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
              {proc.template?.name_ru ?? 'Процесс'}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              ...processStatusStyle(proc.status),
            }}>
              {processStatusLabel(proc.status)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...proc.stages]
              .sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
              .map(stage => (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={stageIconStyle(stage.status, accent)}>
                    {stageIcon(stage.status)}
                  </span>
                  <span style={stageLabelStyle(stage.status, accent)}>
                    {stage.stage_template?.name_ru ?? '—'}
                  </span>
                  {stage.final_code && stage.status === 'completed' && (
                    <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
                      {stage.final_code}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function processStatusLabel(status: string): string {
  if (status === 'active') return 'Активен'
  if (status === 'completed') return 'Завершён'
  if (status === 'cancelled') return 'Отменён'
  return status
}

function processStatusStyle(status: string): React.CSSProperties {
  if (status === 'active') return { background: '#D1FAE5', color: '#065F46' }
  if (status === 'completed') return { background: '#E5E7EB', color: '#374151' }
  if (status === 'cancelled') return { background: '#FEE2E2', color: '#991B1B' }
  return {}
}

function stageIcon(status: string): string {
  if (status === 'completed') return '✓'
  if (status === 'active') return '●'
  if (status === 'skipped' || status === 'cancelled') return '—'
  return '○'
}

function stageIconStyle(status: string, accent: string): React.CSSProperties {
  const base: React.CSSProperties = {
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 700,
  }
  if (status === 'completed') return { ...base, background: '#E5E7EB', color: '#374151' }
  if (status === 'active') return { ...base, background: accent, color: '#fff' }
  if (status === 'skipped' || status === 'cancelled') return { ...base, background: '#F3F4F6', color: '#9CA3AF' }
  return { ...base, background: '#F3F4F6', color: '#D1D5DB' }
}

function stageLabelStyle(status: string, accent: string): React.CSSProperties {
  if (status === 'completed') return { fontSize: 13, color: '#6B7280' }
  if (status === 'active') return { fontSize: 13, color: accent, fontWeight: 600 }
  if (status === 'skipped' || status === 'cancelled') return { fontSize: 13, color: '#9CA3AF', textDecoration: 'line-through' }
  return { fontSize: 13, color: '#9CA3AF' }
}
