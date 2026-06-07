'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface TaskInfo {
  id: string
  title: string
  status: string
  priority: string
  assignee_type: string
  due_date: string | null
  completed_at: string | null
}

interface FinalInfo {
  id: string
  code: string
  name_ru: string
  is_positive: boolean
  sort_order: number
}

interface StageDetail {
  id: string
  status: 'waiting' | 'active' | 'completed' | 'skipped' | 'cancelled'
  final_code: string | null
  activated_at: string | null
  completed_at: string | null
  stage_template: (StageTemplateInfo & { description: string | null; has_tasks: boolean }) | null
  tasks: TaskInfo[]
  finals: FinalInfo[]
  can_manage: boolean
  can_convert: boolean
}

interface Props {
  journeyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function stageStatusLabel(status: string): string {
  if (status === 'completed') return 'Завершён'
  if (status === 'active') return 'Активен'
  if (status === 'waiting') return 'Ожидает'
  if (status === 'skipped') return 'Пропущен'
  if (status === 'cancelled') return 'Отменён'
  return status
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

function taskStatusStyle(status: string): { color: string; label: string } {
  if (status === 'completed') return { color: '#6B7280', label: 'Выполнено' }
  if (status === 'in_progress') return { color: '#2563EB', label: 'В работе' }
  if (status === 'review') return { color: '#7C3AED', label: 'На проверке' }
  if (status === 'cancelled') return { color: '#EF4444', label: 'Отменено' }
  if (status === 'declined') return { color: '#EF4444', label: 'Отклонено' }
  if (status === 'pending') return { color: '#D97706', label: 'Ожидает' }
  return { color: '#9CA3AF', label: 'Не назначено' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcessInfoBlock({ journeyId }: Props) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [stageDetail, setStageDetail] = useState<StageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')

  const accent = getModuleColor('education')

  const reload = useCallback(() => setVersion((v: number) => v + 1), [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/workflow/journeys/${journeyId}/processes`)
      .then(r => r.ok ? r.json() : { processes: [] })
      .then((d: { processes?: ProcessInfo[] }) => setProcesses(d.processes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [journeyId, version])

  async function openStage(stageId: string) {
    setSelectedStageId(stageId)
    setStageDetail(null)
    setCompleteError('')
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/workflow/stages/${stageId}`)
      if (res.ok) setStageDetail(await res.json() as StageDetail)
    } finally {
      setLoadingDetail(false)
    }
  }

  function closeModal() {
    setSelectedStageId(null)
    setStageDetail(null)
    setCompleteError('')
  }

  async function completeStage(finalCode: string) {
    if (!selectedStageId) return
    setCompleting(true)
    setCompleteError('')
    try {
      const res = await fetch(`/api/workflow/stages/${selectedStageId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: finalCode }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setCompleteError(data.error ?? 'Ошибка')
        return
      }
      closeModal()
      reload()
    } finally {
      setCompleting(false)
    }
  }

  // ── Main render ─────────────────────────────────────────────────────────────

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
    <>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...proc.stages]
                .sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
                .map(stage => (
                  <button
                    key={stage.id}
                    onClick={() => openStage(stage.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px 6px', borderRadius: 6, textAlign: 'left', width: '100%',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
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
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* StageCard modal */}
      {selectedStageId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                  {loadingDetail ? 'Загрузка…' : (stageDetail?.stage_template?.name_ru ?? 'Подэтап')}
                </span>
                {stageDetail && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    ...(stageDetail.status === 'active' ? { background: '#D1FAE5', color: '#065F46' }
                      : stageDetail.status === 'completed' ? { background: '#E5E7EB', color: '#374151' }
                      : { background: '#F3F4F6', color: '#6B7280' }),
                  }}>
                    {stageStatusLabel(stageDetail.status)}
                  </span>
                )}
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingDetail && (
                <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  Загрузка данных…
                </div>
              )}

              {!loadingDetail && stageDetail && (
                <>
                  {/* Description */}
                  {stageDetail.stage_template?.description && (
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                      {stageDetail.stage_template.description}
                    </div>
                  )}

                  {/* Tasks */}
                  {stageDetail.tasks.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Задачи
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {stageDetail.tasks.map(task => {
                          const ts = taskStatusStyle(task.status)
                          return (
                            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                              <span style={{ fontSize: 12, color: ts.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {ts.label}
                              </span>
                              <span style={{ fontSize: 13, color: task.status === 'completed' || task.status === 'cancelled' ? '#9CA3AF' : '#1F2937', flex: 1, textDecoration: task.status === 'cancelled' ? 'line-through' : 'none' }}>
                                {task.title}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {stageDetail.tasks.length === 0 && stageDetail.stage_template?.has_tasks && (
                    <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>Задачи не созданы</div>
                  )}

                  {/* Finals (only when active) */}
                  {stageDetail.status === 'active' && stageDetail.finals.length > 0 && stageDetail.can_manage && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Завершить подэтап
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {stageDetail.finals
                          .filter(final => final.code !== 'convert_to_applicant' || stageDetail.can_convert)
                          .map(final => (
                            <button
                              key={final.id}
                              onClick={() => completeStage(final.code)}
                              disabled={completing}
                              style={{
                                padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                                cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.6 : 1,
                                border: 'none',
                                background: final.is_positive ? '#D1FAE5' : '#FEE2E2',
                                color: final.is_positive ? '#065F46' : '#991B1B',
                                transition: 'opacity 0.15s',
                              }}
                            >
                              {final.name_ru}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* No-permission notice */}
                  {stageDetail.status === 'active' && !stageDetail.can_manage && (
                    <div style={{ padding: '10px 14px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, color: '#6B7280' }}>
                      У вас нет прав на завершение этого подэтапа
                    </div>
                  )}

                  {/* Completed info */}
                  {stageDetail.status === 'completed' && stageDetail.final_code && (
                    <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 13, color: '#065F46' }}>
                      Завершён с результатом: <strong>{stageDetail.final_code}</strong>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {completeError
                ? <span style={{ fontSize: 12, color: '#EF4444' }}>{completeError}</span>
                : <span />}
              <button onClick={closeModal} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
