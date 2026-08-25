'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal as UIModal } from '@/components/ui/Modal'
import { roleLabel } from '@/lib/roles/role-label'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { TemplateListRow, StageTemplate, Final, TaskTemplate, Transition, TemplateDetail, Role } from './workflow-shared'
import { btnPrimary, btnGhost, btnDanger } from './workflow-shared'
import { ProcessCreateModal, ProcessEditModal, StageModal, FinalModal, TaskModal, TransitionModal, mutate } from './workflow-modals'

/**
 * Визуальный редактор ШАБЛОНОВ ПРОЦЕССОВ (process templates) — основа
 * workflow приёмки/рекрутинга. Чтение доступно любому авторизованному
 * пользователю; все мутации требуют роли superadmin (сервер вернёт 403).
 * Все контролы правки скрыты за пропом canEdit.
 */

// ── Main client ──────────────────────────────────────────────────────────────
export default function WorkflowsClient({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('settings.workflows')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('navigation')
  const { t: lang } = useLang()

  const [templates, setTemplates] = useState<TemplateListRow[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // modal state
  const [showNewProcess, setShowNewProcess] = useState(false)
  const [showEditProcess, setShowEditProcess] = useState(false)
  const [stageModal, setStageModal] = useState<{ stage: StageTemplate | null } | null>(null)
  const [finalModal, setFinalModal] = useState<{ stageId: string; final: Final | null } | null>(null)
  const [taskModal, setTaskModal] = useState<{ stageId: string; task: TaskTemplate | null } | null>(null)
  const [transitionModal, setTransitionModal] = useState<{ transition: Transition | null } | null>(null)

  const loadList = useCallback(async () => {
    setLoadingList(true); setErr(null)
    try {
      const res = await fetch('/api/workflow/process-templates?active_only=false')
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr((b as { error?: string }).error ?? t('load_failed')); return
      }
      const b = await res.json()
      setTemplates((b.templates ?? []) as TemplateListRow[])
    } catch {
      setErr(t('load_failed'))
    } finally {
      setLoadingList(false)
    }
  }, [t])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/workflow/process-templates/${id}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr((b as { error?: string }).error ?? t('load_failed'))
        setDetail(null); return
      }
      setDetail(await res.json() as TemplateDetail)
    } catch {
      setErr(t('load_failed'))
    } finally {
      setLoadingDetail(false)
    }
  }, [t])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    // roles picker source: GET returns a bare array of roles
    fetch('/api/settings/roles')
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as { roles?: Role[] }).roles ?? []
        setRoles(arr as Role[])
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (selectedId) loadDetail(selectedId); else setDetail(null)
  }, [selectedId, loadDetail])

  // after any mutation: re-fetch detail + list so UI reflects server state
  const refetch = useCallback(async () => {
    await loadList()
    if (selectedId) await loadDetail(selectedId)
  }, [loadList, loadDetail, selectedId])

  async function deactivateProcess() {
    if (!detail) return
    if (!(await confirmDialog({ message: t('deactivate_confirm'), tone: 'danger' }))) return
    const e = await mutate(`/api/workflow/process-templates/${detail.template.id}`, 'DELETE')
    if (e) { setErr(e); return }
    await refetch()
  }

  async function deleteStage(s: StageTemplate) {
    if (!(await confirmDialog({ message: t('delete_stage_confirm'), tone: 'danger' }))) return
    const e = await mutate(`/api/workflow/stage-templates/${s.id}`, 'DELETE')
    if (e) { setErr(t(e, e)); return }
    await refetch()
  }
  async function deleteFinal(f: Final) {
    if (!(await confirmDialog({ message: t('delete_final_confirm'), tone: 'danger' }))) return
    const e = await mutate(`/api/workflow/stage-finals/${f.id}`, 'DELETE')
    if (e) { setErr(t(e, e)); return }
    await refetch()
  }
  async function deleteTask(task: TaskTemplate) {
    if (!(await confirmDialog({ message: t('delete_task_confirm'), tone: 'danger' }))) return
    const e = await mutate(`/api/workflow/stage-task-templates/${task.id}`, 'DELETE')
    if (e) { setErr(e); return }
    await refetch()
  }
  async function deleteTransition(tr: Transition) {
    if (!(await confirmDialog({ message: t('delete_transition_confirm'), tone: 'danger' }))) return
    const e = await mutate(`/api/workflow/stage-transitions/${tr.id}`, 'DELETE')
    if (e) { setErr(e); return }
    await refetch()
  }

  const stageById = useMemo(() => {
    const m = new Map<string, StageTemplate>()
    detail?.stages.forEach(s => m.set(s.id, s))
    return m
  }, [detail])

  function stageLabel(id: string | null): string {
    if (!id) return t('from_start_option')
    const s = stageById.get(id)
    return s ? `${s.name_ru} (${s.code})` : id
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('settings'), borderRadius: 12,
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
        </div>
        {!canEdit && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 8 }}>{t('readonly_badge')}</span>
        )}
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Left: process list ── */}
        <div className="md-rail" style={{ width: 280, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('process_list_title')}</span>
            {canEdit && (
              <button onClick={() => setShowNewProcess(true)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: 12 }}>{t('new_process')}</button>
            )}
          </div>
          {loadingList ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
          ) : templates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('empty_processes')}</div>
          ) : templates.map(tpl => {
            const active = tpl.id === selectedId
            return (
              <div key={tpl.id} onClick={() => setSelectedId(tpl.id)} style={{
                padding: '10px 14px', cursor: 'pointer', borderTop: '1px solid var(--border)',
                borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'var(--accent-tint)' : 'transparent',
                opacity: tpl.is_active ? 1 : 0.55,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {tpl.name_ru}
                  {!tpl.is_active && <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--text-faint)' }}>({t('status_inactive')})</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace', marginTop: 1 }}>{tpl.code}</div>
              </div>
            )
          })}
        </div>

        {/* ── Right: detail ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedId ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
              {t('select_process_hint')}
            </div>
          ) : loadingDetail && !detail ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
          ) : detail ? (
            <div className="space-y-4">

              {/* Process header */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{detail.template.name_ru}</h2>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 6 }}>{detail.template.code}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: detail.template.is_active ? 'var(--success)' : 'var(--text-faint)', background: detail.template.is_active ? 'var(--success-tint)' : 'var(--surface-2)', padding: '2px 8px', borderRadius: 6 }}>
                        {detail.template.is_active ? t('status_active') : t('status_inactive')}
                      </span>
                    </div>
                    {detail.template.description && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>{detail.template.description}</p>}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setShowEditProcess(true)} style={btnGhost}>{tCommon('edit')}</button>
                      {detail.template.is_active && <button onClick={deactivateProcess} style={btnDanger}>{t('deactivate')}</button>}
                    </div>
                  )}
                </div>
              </div>

              {/* Stages */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('stages_title')}</h3>
                  {canEdit && <button onClick={() => setStageModal({ stage: null })} style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }}>{t('add_stage')}</button>}
                </div>
                {detail.stages.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('no_stages')}</div>
                ) : (
                  <div className="space-y-4">
                    {detail.stages.map(s => {
                      const stageFinals = detail.finals.filter(f => f.stage_template_id === s.id)
                      const stageTasks = detail.task_templates.filter(tk => tk.stage_template_id === s.id)
                      const signers = (s.required_role_code ?? '').split(',').map(x => x.trim()).filter(Boolean)
                      return (
                        <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 14 }}>
                          {/* stage header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>#{s.sort_order}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.name_ru}</span>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-faint)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 5 }}>{s.code}</span>
                              </div>
                              {s.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.description}</p>}
                              {/* flags */}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                {s.has_tasks && <Tag label={t('flag_has_tasks')} />}
                                {s.has_action_log && <Tag label={t('flag_has_action_log')} />}
                                {s.is_optional && <Tag label={t('flag_is_optional')} />}
                                {s.is_addable && <Tag label={t('flag_is_addable')} />}
                                {s.requires_signature && <Tag label={t('f_requires_signature')} accent />}
                              </div>
                              {/* who signs */}
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{t('who_signs_label')}: </span>
                                {signers.length ? (
                                  <span style={{ fontFamily: 'monospace', color: 'var(--accent-strong)' }}>{signers.map(c => roleLabel(lang.roles, c)).join(', ')}</span>
                                ) : (
                                  <span style={{ color: 'var(--text-faint)' }}>{t('who_signs_none')}</span>
                                )}
                              </div>
                            </div>
                            {canEdit && (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setStageModal({ stage: s })} style={btnGhost}>{tCommon('edit')}</button>
                                <button onClick={() => deleteStage(s)} style={btnDanger}>{tCommon('delete')}</button>
                              </div>
                            )}
                          </div>

                          {/* Finals sub-section */}
                          <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('finals_title')}</span>
                              {canEdit && <button onClick={() => setFinalModal({ stageId: s.id, final: null })} style={{ ...btnGhost, padding: '3px 9px', fontSize: 11.5 }}>{t('add_final')}</button>}
                            </div>
                            {stageFinals.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('no_finals')}</div>
                            ) : stageFinals.map(f => (
                              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', flexWrap: 'wrap' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.is_positive ? '#16A34A' : 'var(--danger)', flexShrink: 0 }} />
                                <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{f.name_ru}</span>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-faint)' }}>{f.code}</span>
                                {f.closes_process && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#9A3412', background: '#FFF7ED', padding: '1px 6px', borderRadius: 5 }}>{t('f_closes_process')}{f.process_finish_reason ? `: ${f.process_finish_reason}` : ''}</span>}
                                {canEdit && (
                                  <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                                    <button onClick={() => setFinalModal({ stageId: s.id, final: f })} style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('edit')}</button>
                                    <button onClick={() => deleteFinal(f)} style={{ ...btnDanger, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('delete')}</button>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Tasks sub-section */}
                          <div style={{ marginTop: 10, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('tasks_title')}</span>
                              {canEdit && <button onClick={() => setTaskModal({ stageId: s.id, task: null })} style={{ ...btnGhost, padding: '3px 9px', fontSize: 11.5 }}>{t('add_task')}</button>}
                            </div>
                            {stageTasks.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('no_tasks')}</div>
                            ) : stageTasks.map(tk => (
                              <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{tk.title}</span>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-faint)' }}>{tk.code}</span>
                                {tk.default_assignee_type && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 5 }}>{t('at_' + tk.default_assignee_type, tk.default_assignee_type)}{tk.default_assignee_type === 'role' && tk.default_role_code ? `: ${tk.default_role_code}` : ''}{tk.default_assignee_type === 'department' && tk.default_department_id ? `: ${tk.default_department_id}` : ''}</span>}
                                {tk.default_priority && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 5 }}>{t('pr_' + tk.default_priority, tk.default_priority)}</span>}
                                {tk.default_due_days != null && <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{t('f_due_days')}: {tk.default_due_days}</span>}
                                {canEdit && (
                                  <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                                    <button onClick={() => setTaskModal({ stageId: s.id, task: tk })} style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('edit')}</button>
                                    <button onClick={() => deleteTask(tk)} style={{ ...btnDanger, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('delete')}</button>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Transitions */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('transitions_title')}</h3>
                  {canEdit && <button onClick={() => setTransitionModal({ transition: null })} style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12 }} disabled={detail.stages.length === 0}>{t('add_transition')}</button>}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>{t('mode_help')}</p>
                {detail.transitions.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('no_transitions')}</div>
                ) : (
                  <div className="space-y-2">
                    {detail.transitions.map(tr => (
                      <div key={tr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>#{tr.sort_order}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{stageLabel(tr.from_stage_template_id)}</span>
                        <span style={{ color: 'var(--text-faint)' }}>→</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{stageLabel(tr.to_stage_template_id)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 7px', borderRadius: 5 }}>
                          {tr.trigger_final_code ? `${t('f_trigger_final')}: ${tr.trigger_final_code}` : t('any_final_option')}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 7px', borderRadius: 5 }}>
                          {tr.activation_mode === 'after_all' ? t('mode_after_all') : t('mode_after_one')}
                        </span>
                        {canEdit && (
                          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
                            <button onClick={() => setTransitionModal({ transition: tr })} style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('edit')}</button>
                            <button onClick={() => deleteTransition(tr)} style={{ ...btnDanger, padding: '2px 8px', fontSize: 11.5 }}>{tCommon('delete')}</button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modals */}
      {canEdit && showNewProcess && (
        <ProcessCreateModal t={t} tCommon={tCommon} onClose={() => setShowNewProcess(false)} onSaved={async () => { setShowNewProcess(false); await loadList() }} />
      )}
      {canEdit && showEditProcess && detail && (
        <ProcessEditModal t={t} tCommon={tCommon} template={detail.template} onClose={() => setShowEditProcess(false)} onSaved={async () => { setShowEditProcess(false); await refetch() }} />
      )}
      {canEdit && stageModal && selectedId && (
        <StageModal t={t} tCommon={tCommon} processId={selectedId} stage={stageModal.stage} roles={roles} onClose={() => setStageModal(null)} onSaved={async () => { setStageModal(null); await refetch() }} />
      )}
      {canEdit && finalModal && (
        <FinalModal t={t} tCommon={tCommon} stageId={finalModal.stageId} final={finalModal.final} onClose={() => setFinalModal(null)} onSaved={async () => { setFinalModal(null); await refetch() }} />
      )}
      {canEdit && taskModal && (
        <TaskModal t={t} tCommon={tCommon} stageId={taskModal.stageId} task={taskModal.task} roles={roles} onClose={() => setTaskModal(null)} onSaved={async () => { setTaskModal(null); await refetch() }} />
      )}
      {canEdit && transitionModal && detail && (
        <TransitionModal t={t} tCommon={tCommon} stages={detail.stages} finals={detail.finals} transition={transitionModal.transition} onClose={() => setTransitionModal(null)} onSaved={async () => { setTransitionModal(null); await refetch() }} />
      )}
    </div>
  )
}

function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
      color: accent ? 'var(--accent-strong)' : 'var(--text-muted)',
      background: accent ? 'var(--accent-tint)' : 'var(--surface)',
      border: '1px solid var(--border)',
    }}>{label}</span>
  )
}
