'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import ProcessGraphModal from './ProcessGraphModal'
import StageEventsFeed from './StageEventsFeed'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from './SignatureCapture'
import { useMe } from '@/lib/hooks/useMe'
import { toast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/Modal'

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
  can_sign?: boolean
  required_role_code?: string | null
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

// Успешное закрытие приёма движок кодирует как process 'cancelled' + finish_reason
// 'admitted'/'admitted_conditional' (ветка A). Для пользователя это «Принята», а не
// «Отменён» — показываем зелёным с ярлыком финала, чтобы не пугало «בוטל».
const POSITIVE_CLOSE_REASONS = new Set(['admitted', 'admitted_conditional'])

function processStatusStyle(status: string): React.CSSProperties {
  if (status === 'active') return { background: 'var(--success-tint)', color: 'var(--success)' }
  if (status === 'completed') return { background: 'var(--border)', color: 'var(--text)' }
  if (status === 'cancelled') return { background: 'var(--danger-tint)', color: 'var(--danger)' }
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
  if (status === 'completed') return { ...base, background: 'var(--border)', color: 'var(--text)' }
  if (status === 'active') return { ...base, background: accent, color: '#fff' }
  if (status === 'skipped' || status === 'cancelled') return { ...base, background: 'var(--surface-2)', color: 'var(--text-faint)' }
  return { ...base, background: 'var(--surface-2)', color: 'var(--border-strong)' }
}

function stageLabelStyle(status: string, accent: string): React.CSSProperties {
  if (status === 'completed') return { fontSize: 13, color: 'var(--text-muted)' }
  if (status === 'active') return { fontSize: 13, color: accent, fontWeight: 600 }
  if (status === 'skipped' || status === 'cancelled') return { fontSize: 13, color: 'var(--text-faint)', textDecoration: 'line-through' }
  return { fontSize: 13, color: 'var(--text-faint)' }
}

/**
 * Цвет кнопки финала по семантике:
 *   code ∈ ORANGE_FINAL_CODES                     → оранжевый (приоритет над is_positive)
 *   is_positive=true                              → зелёный
 *   is_positive=false                             → красный
 */
const ORANGE_FINAL_CODES = new Set(['postponed', 'partial', 'done_event_later', 'no_show'])
function finalButtonColors(code: string, isPositive: boolean): { background: string; color: string } {
  if (ORANGE_FINAL_CODES.has(code)) return { background: 'var(--warn-tint)', color: 'var(--warn)' }
  if (isPositive) return { background: 'var(--success-tint)', color: 'var(--success)' }
  return { background: 'var(--danger-tint)', color: 'var(--danger)' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcessInfoBlock({ journeyId, canManage = false, canConvert = false }: Props) {
  const router = useRouter()
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const tEv = useTranslations('events')
  const me = useMe()

  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  // «Занавес»: закрытые процессы (набор/старый приём) свёрнуты по умолчанию,
  // раскрываются по клику — на карточке остаётся виден только активный.
  const [pastOpen, setPastOpen] = useState(false)

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [stageDetail, setStageDetail] = useState<StageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [pendingSig, setPendingSig] = useState<{ finalCode: string } | null>(null)
  const [sigPayload, setSigPayload] = useState<SignaturePayload | null>(null)
  const [sigNote, setSigNote] = useState('')

  const [graphProcessId, setGraphProcessId] = useState<string | null>(null)

  const [reactivatingStage, setReactivatingStage] = useState<{ id: string; name: string } | null>(null)
  const [reactivating, setReactivating] = useState(false)
  // «Занавес» (п. י"ב): свёрнутая история завершённых шагов до текущего фронтира.
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({})

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
    if (status === 'completed') return { color: 'var(--text-muted)', label }
    if (status === 'in_progress') return { color: 'var(--accent-strong)', label }
    if (status === 'review') return { color: '#7C3AED', label }
    if (status === 'cancelled') return { color: 'var(--danger)', label }
    if (status === 'declined') return { color: 'var(--danger)', label }
    if (status === 'pending') return { color: '#D97706', label }
    return { color: 'var(--text-faint)', label }
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
        toast(data.error ?? t('process.modals.activate_title'), 'error')
        return
      }
      setReactivatingStage(null)
      reload()
      router.refresh()
    } catch {
      toast(tCommon('error'), 'error')
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
      setSigNote('')
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

      const rd: Record<string, unknown> = {}
      if (signatureBody) rd.signature = signatureBody
      if (sigNote.trim()) rd.note = sigNote.trim()
      const body: Record<string, unknown> = { final_code: finalCode }
      if (Object.keys(rd).length) body.result_data = rd

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
      toast(tCommon('saved'), 'success')
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
      toast(tCommon('saved'), 'success')
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', color: 'var(--text-faint)', fontSize: 13 }}>
        {t('process.loading')}
      </div>
    )
  }

  if (processes.length === 0) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', color: 'var(--text-faint)', fontSize: 13 }}>
        {t('process.no_processes')}
      </div>
    )
  }

  const renderProcCard = (proc: ProcessInfo) => (
          <div key={proc.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {proc.template ? t(`process.names.${proc.template.code}`, proc.template.name_ru) : t('process.title')}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                ...(proc.status === 'cancelled' && proc.finish_reason && POSITIVE_CLOSE_REASONS.has(proc.finish_reason)
                  ? { background: 'var(--success-tint)', color: 'var(--success)' }
                  : processStatusStyle(proc.status)),
              }}>
                {proc.status === 'cancelled' && proc.finish_reason && POSITIVE_CLOSE_REASONS.has(proc.finish_reason)
                  ? t(`process.finals.${proc.finish_reason}`, proc.finish_reason)
                  : processStatusLabel(proc.status)}
              </span>
              <button
                onClick={() => setGraphProcessId(proc.id)}
                title={t('process.actions.view_graph')}
                style={{
                  marginLeft: 'auto', padding: '3px 10px', fontSize: 11, fontWeight: 500,
                  color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
              >
                {t('process.actions.view_graph')}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                const sorted = [...proc.stages]
                  .sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
                const stageRow = (stage: (typeof sorted)[number]) => (
                  <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => openStage(stage.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px 6px', borderRadius: 6, textAlign: 'start', flex: 1, minWidth: 0,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
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
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
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
                          padding: '2px 6px', fontSize: 11, fontWeight: 500, color: 'var(--accent-strong)',
                          whiteSpace: 'nowrap', borderRadius: 4,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none' }}
                      >
                        {t('process.actions.activate_stage')}
                      </button>
                    )}
                    {/* Переоткрыть ЗАВЕРШЁННЫЙ подэтап — изменить решение (п. י"ב).
                        Только «фронтир» (RPC сам блокирует, если поток ушёл дальше). */}
                    {stage.status === 'completed' && proc.status === 'active' && canManage && (
                      <button
                        onClick={() => setReactivatingStage({ id: stage.id, name: stage.stage_template ? t(`process.stages.${stage.stage_template.code}`, stage.stage_template.name_ru) : '' })}
                        title={t('process.actions.change_decision')}
                        style={{
                          flexShrink: 0, marginInlineStart: 6, background: 'none', border: 'none', cursor: 'pointer',
                          padding: '2px 6px', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
                          whiteSpace: 'nowrap', borderRadius: 4,
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-strong)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                      >
                        {t('process.actions.change_decision')}
                      </button>
                    )}
                  </div>
                )
                // «Занавес» (п. י"ב): свернуть завершённую историю до текущего
                // фронтира (первый active/waiting) под раскрывающийся заголовок
                // «תחילת התהליך». Помогает после «изменить решение», когда набор
                // шагов открылся заново — старый набор не загромождает вид.
                const frontierIdx = sorted.findIndex(s => s.status === 'active' || s.status === 'waiting')
                const history = frontierIdx > 0 ? sorted.slice(0, frontierIdx) : []
                if (!(frontierIdx > 0 && history.length >= 3)) return sorted.map(stageRow)
                const rest = sorted.slice(frontierIdx)
                const open = !!historyOpen[proc.id]
                return (
                  <>
                    <button
                      onClick={() => setHistoryOpen(m => ({ ...m, [proc.id]: !open }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: '100%', textAlign: 'start' }}
                    >
                      <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
                      <span>{t('process.history_curtain', 'תחילת התהליך')}</span>
                      <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>· {history.length}</span>
                    </button>
                    {open && history.map(stageRow)}
                    {rest.map(stageRow)}
                  </>
                )
              })()}
            </div>

            {proc.status === 'active' && canManage && (
              <button
                onClick={() => openCloseEarly(proc)}
                style={{
                  marginTop: 12, width: '100%', padding: '8px 12px',
                  fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                  cursor: 'pointer', textAlign: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
              >
                {t('process.actions.close_process_early')}
              </button>
            )}
          </div>
  )

  const activeProcs = processes.filter(p => p.status === 'active')
  const pastProcs = processes.filter(p => p.status !== 'active')

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeProcs.map(renderProcCard)}
        {pastProcs.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <button type="button" onClick={() => setPastOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--surface-2)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
              <svg style={{ width: 15, height: 15, color: 'var(--text-faint)', flexShrink: 0, transform: pastOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6l6 6-6 6" /></svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{t('process.past_processes', 'תהליכים קודמים')}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', marginInlineStart: 4 }}>{pastProcs.length}</span>
            </button>
            {pastOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
                {pastProcs.map(renderProcCard)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* StageCard modal */}
      {selectedStageId && (
        <Modal
          onClose={closeModal}
          maxWidth={520}
          zIndex={60}
          closeOnBackdrop
          panelStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflowY: 'visible', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}
        >
            {/* Header */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                  {loadingDetail
                    ? tCommon('loading')
                    : stageDetail?.stage_template
                      ? t(`process.stages.${stageDetail.stage_template.code}`, stageDetail.stage_template.name_ru)
                      : '—'}
                </span>
                {stageDetail && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    ...(stageDetail.status === 'active' ? { background: 'var(--success-tint)', color: 'var(--success)' }
                      : stageDetail.status === 'completed' ? { background: 'var(--border)', color: 'var(--text)' }
                      : { background: 'var(--surface-2)', color: 'var(--text-muted)' }),
                  }}>
                    {stageStatusLabel(stageDetail.status)}
                  </span>
                )}
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingDetail && (
                <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  {tCommon('loading')}
                </div>
              )}

              {!loadingDetail && stageDetail && (
                <>
                  {/* Tab bar — only for active/completed stages */}
                  {(stageDetail.status === 'active' || stageDetail.status === 'completed') && (
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--surface-2)', marginBottom: 16, gap: 0 }}>
                      {(['tasks', 'events'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setStageTab(tab)}
                          style={{
                            padding: '6px 16px', fontSize: 12, fontWeight: 500,
                            border: 'none', background: 'none', cursor: 'pointer',
                            borderBottom: stageTab === tab ? `2px solid ${accent}` : '2px solid transparent',
                            color: stageTab === tab ? accent : 'var(--text-muted)',
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
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                      {stageDetail.stage_template.description}
                    </div>
                  )}

                  {stageDetail.tasks.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        {t('process.tasks_label')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {stageDetail.tasks.map(task => {
                          const ts = taskStatusStyle(task.status)
                          return (
                            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                              <span style={{ fontSize: 12, color: ts.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {ts.label}
                              </span>
                              <Link
                                href={`/dashboard/tasks/${task.id}`}
                                style={{
                                  fontSize: 13, flex: 1,
                                  color: task.status === 'completed' || task.status === 'cancelled' ? 'var(--text-faint)' : 'var(--accent-strong)',
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
                    stageDetail.status === 'waiting' ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, lineHeight: 1.5 }}>
                        {t('process.stage_waiting_hint')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 16 }}>{t('process.no_tasks_created')}</div>
                    )
                  )}

                  {stageDetail.status === 'active' && stageDetail.finals.length > 0 && (stageDetail.stage_template?.requires_signature ? stageDetail.can_sign : stageDetail.can_manage) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        {t('process.close_stage_section')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {/* Перевод в приёмную комиссию прямо из шага решения (не
                            только верхней кнопкой HandoffButton) — по просьбе
                            владельца. Та же метка и то же действие. */}
                        {canConvert && stageDetail.finals.some(f => f.code === 'convert_to_applicant') && (
                          <button
                            onClick={() => onFinalClick('convert_to_applicant')}
                            disabled={completing}
                            style={{
                              padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                              cursor: completing ? 'not-allowed' : 'pointer', opacity: completing ? 0.6 : 1,
                              border: 'none', background: 'var(--violet)', color: '#fff',
                              transition: 'opacity 0.15s',
                            }}
                          >
                            → {t('handoff.button')}
                          </button>
                        )}
                        {stageDetail.finals
                          // Конверсию лид→кандидат показываем выделенной кнопкой выше
                          // (когда canConvert), поэтому в общем списке её не дублируем.
                          .filter(final => final.code !== 'convert_to_applicant')
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

                  {stageDetail.status === 'active' && !(stageDetail.stage_template?.requires_signature ? stageDetail.can_sign : stageDetail.can_manage) && (
                    <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                      {stageDetail.stage_template?.requires_signature && stageDetail.can_manage
                        ? t('process.sign_not_your_authority', 'החתימה על שלב זה שמורה לבעל התפקיד המתאים')
                        : t('process.no_rights')}
                    </div>
                  )}

                  {stageDetail.status === 'completed' && stageDetail.final_code && (
                    <div style={{ padding: '10px 14px', background: 'var(--success-tint)', border: '1px solid var(--success)', borderRadius: 8, fontSize: 13, color: 'var(--success)' }}>
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
            <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {completeError
                ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>{completeError}</span>
                : <span />}
              <button onClick={closeModal} style={{ padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                {t('process.close')}
              </button>
            </div>
        </Modal>
      )}

      {/* Signature modal — shown when completing a stage that requires a signature */}
      {pendingSig && (
        <Modal
          onClose={() => !completing && setPendingSig(null)}
          maxWidth={520}
          zIndex={60}
          closeOnBackdrop
          panelStyle={{ padding: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 14 }}
        >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('process.signature.title')}</div>
            <textarea
              value={sigNote}
              onChange={e => setSigNote(e.target.value)}
              placeholder={`${tCommon('optional_note')} — ${tCommon('note_placeholder')}`}
              rows={2}
              style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <SignatureCapture method={stageDetail?.signature_method ?? 'both'} defaultTypedName={me?.full_name ?? undefined} onChange={setSigPayload} />
            {completeError && <div style={{ fontSize: 13, color: 'var(--danger)' }}>{completeError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingSig(null)}
                disabled={completing}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={() => completeStage(pendingSig.finalCode, sigPayload)}
                disabled={completing || !sigPayload}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: completing || !sigPayload ? 'not-allowed' : 'pointer', opacity: completing || !sigPayload ? 0.6 : 1 }}
              >
                {t('process.signature.confirm')}
              </button>
            </div>
        </Modal>
      )}

      {/* Close-process-early modal */}
      {closingProc && (
        <Modal
          onClose={closeCloseEarly}
          maxWidth={480}
          zIndex={60}
          closeOnBackdrop
          panelStyle={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflowY: 'visible', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}
        >
            {/* Header */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid var(--surface-2)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {t('process.modals.close_early_title')}
              </span>
              <button onClick={closeCloseEarly} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                {t('process.modals.close_early_desc')}
              </div>

              {loadingFinals && (
                <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  {tCommon('loading')}
                </div>
              )}

              {!loadingFinals && closingFinals.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('process.modals.no_finals')}</div>
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
            <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {closeError
                ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>{closeError}</span>
                : <span />}
              <button onClick={closeCloseEarly} style={{ padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                {t('process.cancel')}
              </button>
            </div>
        </Modal>
      )}

      {/* Reactivate stage confirm modal */}
      {reactivatingStage && (
        <Modal
          onClose={() => setReactivatingStage(null)}
          maxWidth={440}
          zIndex={60}
          closeOnBackdrop
          panelStyle={{ boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {t('process.modals.activate_title')}
              </span>
              <button
                onClick={() => setReactivatingStage(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                <strong>«{reactivatingStage.name}»</strong> — {t('process.modals.activate_text')}
              </p>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setReactivatingStage(null)}
                disabled={reactivating}
                style={{ padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
              >
                {t('process.cancel')}
              </button>
              <button
                onClick={handleReactivate}
                disabled={reactivating}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: 'var(--accent-strong)', color: '#fff',
                  cursor: reactivating ? 'wait' : 'pointer',
                  opacity: reactivating ? 0.6 : 1,
                }}
              >
                {reactivating ? t('process.modals.activating') : t('process.modals.activate_button')}
              </button>
            </div>
        </Modal>
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
