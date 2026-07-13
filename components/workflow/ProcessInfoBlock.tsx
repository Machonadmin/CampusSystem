'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import ProcessGraphModal from './ProcessGraphModal'
import StageEventsFeed from './StageEventsFeed'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from './SignatureCapture'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StageFinalName {
  code: string
  name_ru: string
  is_positive?: boolean
}

interface StageTemplateInfo {
  id: string
  code: string
  name_ru: string
  sort_order: number
  finals?: StageFinalName[]
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
  stage_template: (StageTemplateInfo & { description: string | null; has_tasks: boolean; requires_signature?: boolean }) | null
  tasks: TaskInfo[]
  finals: FinalInfo[]
  can_manage: boolean
  can_convert: boolean
  signature_method?: SignatureMethod
}

interface ClosingFinal {
  code: string
  name_ru: string
  is_positive: boolean
}

interface Props {
  journeyId: string
  canManage?: boolean
  canConvert?: boolean
}

// ── Stateless style helpers (no translations needed) ──────────────────────────

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

/**
 * Цвет кнопки финала по семантике:
 *   code ∈ ORANGE_FINAL_CODES                     → оранжевый (приоритет над is_positive)
 *   is_positive=true                              → зелёный
 *   is_positive=false                             → красный
 */
const ORANGE_FINAL_CODES = new Set(['postponed', 'partial', 'done_event_later', 'no_show'])
function finalButtonColors(code: string, isPositive: boolean): { background: string; color: string } {
  if (ORANGE_FINAL_CODES.has(code)) return { background: '#FED7AA', color: '#9A3412' }
  if (isPositive) return { background: '#D1FAE5', color: '#065F46' }
  return { background: '#FEE2E2', color: '#991B1B' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcessInfoBlock({ journeyId, canManage = false, canConvert = false }: Props) {
  const router = useRouter()
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const tEv = useTranslations('events')

  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [stageDetail, setStageDetail] = useState<StageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [pendingSig, setPendingSig] = useState<{ finalCode: string } | null>(null)
  const [sigPayload, setSigPayload] = useState<SignaturePayload | null>(null)

  const [graphProcessId, setGraphProcessId] = useState<string | null>(null)

  const [reactivatingStage, setReactivatingStage] = useState<{ id: string; name: string } | null>(null)
  const [reactivating, setReactivating] = useState(false)

  const [closingProc, setClosingProc] = useState<ProcessInfo | null>(null)
  const [closingFinals, setClosingFinals] = useState<ClosingFinal[]>([])
  const [loadingFinals, setLoadingFinals] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [stageTab, setStageTab] = useState<'tasks' | 'events'>('tasks')

  const accent = getModuleColor('education')

  const reload = useCallback(() => setVersion((v: number) => v + 1), [])

  // ── Translated label helpers ─────────────────────────────────────────────────

  function processStatusLabel(status: string): string {
    return t(`process.process_status.${status}`, status)
  }

  function stageStatusLabel(status: string): string {
    return t(`process.stage_status.${status}`, status)
  }

  function taskStatusStyle(status: string): { color: string; label: string } {
    const label = t(`process.task_status.${status}`, status)
    if (status === 'completed') return { color: '#6B7280', label }
    if (status === 'in_progress') return { color: '#2563EB', label }
    if (status === 'review') return { color: '#7C3AED', label }
    if (status === 'cancelled') return { color: '#EF4444', label }
    if (status === 'declined') return { color: '#EF4444', label }
    if (status === 'pending') return { color: '#D97706', label }
    return { color: '#9CA3AF', label }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleReactivate() {
    if (!reactivatingStage) return
    const stageId = reactivatingStage.id
    setReactivating(true)
    try {
      const res = await fetch(`/api/workflow/stages/${stageId}/reactivate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        alert(data.error ?? t('process.modals.activate_title'))
        return
      }
      setReactivatingStage(null)
      reload()
      router.refresh()
    } catch {
      alert(tCommon('error'))
    } finally {
      setReactivating(false)
    }
  }

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
    setStageTab('tasks')
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
    setStageTab('tasks')
  }

  // Clicking a final: if the stage requires a signature, open the signature
  // dialog first; otherwise complete directly (unchanged behavior).
  function onFinalClick(finalCode: string) {
    if (stageDetail?.stage_template?.requires_signature) {
      setSigPayload(null)
      setCompleteError('')
      setPendingSig({ finalCode })
    } else {
      completeStage(finalCode)
    }
  }

  async function completeStage(finalCode: string, signature?: SignaturePayload | null) {
    if (!selectedStageId) return
    setCompleting(true)
    setCompleteError('')
    try {
      let signatureBody: Record<string, unknown> | undefined
      if (signature) {
        if (signature.kind === 'drawn' && signature.drawing_blob) {
          // Upload the drawn PNG first → server returns a stage-bound storage path.
          const fd = new FormData()
          fd.append('file', signature.drawing_blob, 'signature.png')
          const up = await fetch(`/api/workflow/stages/${selectedStageId}/signature/upload`, { method: 'POST', body: fd })
          if (!up.ok) {
            const d = await up.json().catch(() => ({})) as { error?: string }
            setCompleteError(d.error ?? tCommon('error'))
            return
          }
          const { storage_path } = await up.json() as { storage_path: string }
          signatureBody = { kind: 'drawn', drawing_path: storage_path }
        } else if (signature.kind === 'typed' && signature.typed_name) {
          signatureBody = { kind: 'typed', typed_name: signature.typed_name }
        }
      }

      const body: Record<string, unknown> = { final_code: finalCode }
      if (signatureBody) body.result_data = { signature: signatureBody }

      const res = await fetch(`/api/workflow/stages/${selectedStageId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setCompleteError(data.error ?? tCommon('error'))
        return
      }
      setPendingSig(null)
      closeModal()
      reload()
    } finally {
      setCompleting(false)
    }
  }

  async function openCloseEarly(proc: ProcessInfo) {
    setClosingProc(proc)
    setClosingFinals([])
    setCloseError('')
    setLoadingFinals(true)
    try {
      const res = await fetch(`/api/workflow/processes/${proc.id}/closing-finals`)
      if (res.ok) {
        const data = await res.json() as { finals?: ClosingFinal[] }
        setClosingFinals(data.finals ?? [])
      }
    } finally {
      setLoadingFinals(false)
    }
  }

  function closeCloseEarly() {
    setClosingProc(null)
    setClosingFinals([])
    setCloseError('')
  }

  async function submitCloseEarly(finalCode: string) {
    if (!closingProc) return
    setClosing(true)
    setCloseError('')
    try {
      const res = await fetch(`/api/workflow/processes/${closingProc.id}/close-early`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: finalCode }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setCloseError(data.error ?? tCommon('error'))
        return
      }
      closeCloseEarly()
      reload()
      router.refresh()
    } finally {
      setClosing(false)
    }
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', color: '#9CA3AF', fontSize: 13 }}>
        {t('process.loading')}
      </div>
    )
  }

  if (processes.length === 0) {
    return (
      <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', color: '#9CA3AF', fontSize: 13 }}>
        {t('process.no_processes')}
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
                {proc.template?.name_ru ?? t('process.title')}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                ...processStatusStyle(proc.status),
              }}>
                {processStatusLabel(proc.status)}
              </span>
              <button
                onClick={() => setGraphProcessId(proc.id)}
                title={t('process.actions.view_graph')}
                style={{
                  marginLeft: 'auto', padding: '3px 10px', fontSize: 11, fontWeight: 500,
                  color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB',
                  borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
              >
                {t('process.actions.view_graph')}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...proc.stages]
                .sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
                .map(stage => (
                  <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => openStage(stage.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px 6px', borderRadius: 6, textAlign: 'left', flex: 1, minWidth: 0,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    >
                      <span style={stageIconStyle(stage.status, accent)}>
                        {stageIcon(stage.status)}
                      </span>
                      <span style={stageLabelStyle(stage.status, accent)}>
                        {stage.stage_template
                          ? t(`process.stages.${stage.stage_template.code}`, stage.stage_template.name_ru)
                          : '—'}
                      </span>
                      {stage.final_code && stage.status === 'completed' && (
                        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
                          {t(`process.finals.${stage.final_code}`,
                            stage.stage_template?.finals?.find(f => f.code === stage.final_code)?.name_ru ?? stage.final_code)}
                        </span>
                      )}
                    </button>
                    {stage.status === 'skipped' && proc.status === 'active' && canManage && (
                      <button
                        onClick={() => setReactivatingStage({ id: stage.id, name: stage.stage_template ? t(`process.stages.${stage.stage_template.code}`, stage.stage_template.name_ru) : '' })}
                        title={t('process.actions.activate_stage')}
                        style={{
                          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                          padding: '2px 6px', fontSize: 11, fontWeight: 500, color: '#2563EB',
                          whiteSpace: 'nowrap', borderRadius: 4,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none' }}
                      >
                        {t('process.actions.activate_stage')}
                      </button>
                    )}
                  </div>
                ))}
            </div>

            {proc.status === 'active' && canManage && (
              <button
                onClick={() => openCloseEarly(proc)}
                style={{
                  marginTop: 12, width: '100%', padding: '8px 12px',
                  fontSize: 12, fontWeight: 500, color: '#6B7280',
                  background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
                  cursor: 'pointer', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
              >
                {t('process.actions.close_process_early')}
              </button>
            )}
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
                  {loadingDetail
                    ? tCommon('loading')
                    : stageDetail?.stage_template
                      ? t(`process.stages.${stageDetail.stage_template.code}`, stageDetail.stage_template.name_ru)
                      : '—'}
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
                  {tCommon('loading')}
                </div>
              )}

              {!loadingDetail && stageDetail && (
                <>
                  {/* Tab bar — only for active/completed stages */}
                  {(stageDetail.status === 'active' || stageDetail.status === 'completed') && (
                    <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', marginBottom: 16, gap: 0 }}>
                      {(['tasks', 'events'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setStageTab(tab)}
                          style={{
                            padding: '6px 16px', fontSize: 12, fontWeight: 500,
                            border: 'none', background: 'none', cursor: 'pointer',
                            borderBottom: stageTab === tab ? `2px solid ${accent}` : '2px solid transparent',
                            color: stageTab === tab ? accent : '#6B7280',
                            marginBottom: -1,
                          }}
                        >
                          {tab === 'tasks' ? tEv('tab_tasks') : tEv('tab_events')}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Events tab */}
                  {stageTab === 'events' && selectedStageId && (
                    <StageEventsFeed stageInstanceId={selectedStageId} canManage={stageDetail.can_manage} />
                  )}

                  {/* Tasks tab (default) */}
                  {stageTab === 'tasks' && (
                  <>

                  {stageDetail.stage_template?.description && (
                    <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                      {stageDetail.stage_template.description}
                    </div>
                  )}

                  {stageDetail.tasks.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        {t('process.tasks_label')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {stageDetail.tasks.map(task => {
                          const ts = taskStatusStyle(task.status)
                          return (
                            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                              <span style={{ fontSize: 12, color: ts.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {ts.label}
                              </span>
                              <Link
                                href={`/dashboard/tasks/${task.id}`}
                                style={{
                                  fontSize: 13, flex: 1,
                                  color: task.status === 'completed' || task.status === 'cancelled' ? '#9CA3AF' : '#2563EB',
                                  textDecoration: task.status === 'cancelled' ? 'line-through' : 'none',
                                }}
                                onMouseEnter={e => { if (task.status !== 'cancelled') (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = task.status === 'cancelled' ? 'line-through' : 'none' }}
                              >
                                {task.title}
                              </Link>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {stageDetail.tasks.length === 0 && stageDetail.stage_template?.has_tasks && (
                    <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>{t('process.no_tasks_created')}</div>
                  )}

                  {stageDetail.status === 'active' && stageDetail.finals.length > 0 && stageDetail.can_manage && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        {t('process.close_stage_section')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {stageDetail.finals
                          .filter(final => final.code !== 'convert_to_applicant' || stageDetail.can_convert)
                          .map(final => {
                            const colors = finalButtonColors(final.code, final.is_positive)
                            return (
                              <button
                                key={final.id}
                                onClick={() => onFinalClick(final.code)}
                                disabled={completing}
                                style={{
                                  padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                                  cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.6 : 1,
                                  border: 'none',
                                  background: colors.background,
                                  color: colors.color,
                                  transition: 'opacity 0.15s',
                                }}
                              >
                                {t(`process.finals.${final.code}`, final.name_ru)}
                              </button>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  {stageDetail.status === 'active' && !stageDetail.can_manage && (
                    <div style={{ padding: '10px 14px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, color: '#6B7280' }}>
                      {t('process.no_rights')}
                    </div>
                  )}

                  {stageDetail.status === 'completed' && stageDetail.final_code && (
                    <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 13, color: '#065F46' }}>
                      {t('process.completed_with')} <strong>
                        {t(`process.finals.${stageDetail.final_code}`,
                          stageDetail.finals.find(f => f.code === stageDetail.final_code)?.name_ru ?? stageDetail.final_code)}
                      </strong>
                    </div>
                  )}
                  </>
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
                {t('process.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature modal — shown when completing a stage that requires a signature */}
      {pendingSig && (
        <div
          onClick={() => !completing && setPendingSig(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 'min(520px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{t('process.signature.title')}</div>
            <SignatureCapture method={stageDetail?.signature_method ?? 'both'} onChange={setSigPayload} />
            {completeError && <div style={{ fontSize: 13, color: '#DC2626' }}>{completeError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingSig(null)}
                disabled={completing}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={() => completeStage(pendingSig.finalCode, sigPayload)}
                disabled={completing || !sigPayload}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#4F46E5', color: '#fff', cursor: completing || !sigPayload ? 'not-allowed' : 'pointer', opacity: completing || !sigPayload ? 0.6 : 1 }}
              >
                {t('process.signature.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close-process-early modal */}
      {closingProc && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) closeCloseEarly() }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                {t('process.modals.close_early_title')}
              </span>
              <button onClick={closeCloseEarly} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
                {t('process.modals.close_early_desc')}
              </div>

              {loadingFinals && (
                <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  {tCommon('loading')}
                </div>
              )}

              {!loadingFinals && closingFinals.length === 0 && (
                <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('process.modals.no_finals')}</div>
              )}

              {!loadingFinals && closingFinals.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {closingFinals
                    .filter(final => final.code !== 'convert_to_applicant' || canConvert)
                    .map(final => {
                      const colors = finalButtonColors(final.code, final.is_positive)
                      return (
                        <button
                          key={final.code}
                          onClick={() => submitCloseEarly(final.code)}
                          disabled={closing}
                          style={{
                            padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                            cursor: closing ? 'not-allowed' : 'pointer', opacity: closing ? 0.6 : 1,
                            border: 'none',
                            background: colors.background,
                            color: colors.color,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          {t(`process.finals.${final.code}`, final.name_ru)}
                        </button>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {closeError
                ? <span style={{ fontSize: 12, color: '#EF4444' }}>{closeError}</span>
                : <span />}
              <button onClick={closeCloseEarly} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                {t('process.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate stage confirm modal */}
      {reactivatingStage && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setReactivatingStage(null) }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                {t('process.modals.activate_title')}
              </span>
              <button
                onClick={() => setReactivatingStage(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                <strong>«{reactivatingStage.name}»</strong> — {t('process.modals.activate_text')}
              </p>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setReactivatingStage(null)}
                disabled={reactivating}
                style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}
              >
                {t('process.cancel')}
              </button>
              <button
                onClick={handleReactivate}
                disabled={reactivating}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: '#2563EB', color: '#fff',
                  cursor: reactivating ? 'wait' : 'pointer',
                  opacity: reactivating ? 0.6 : 1,
                }}
              >
                {reactivating ? t('process.modals.activating') : t('process.modals.activate_button')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Process graph modal */}
      {graphProcessId && (
        <ProcessGraphModal
          processInstanceId={graphProcessId}
          onClose={() => setGraphProcessId(null)}
          onStageClick={(stageInstanceId) => {
            setGraphProcessId(null)
            openStage(stageInstanceId)
          }}
        />
      )}
    </>
  )
}
