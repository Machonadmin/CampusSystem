'use client'

// Модальные формы редактора workflow-шаблонов. Вынесено из WorkflowsClient.tsx
// для разгрузки монолита; поведение не менялось. Каждая модалка самодостаточна
// (данные/колбэки — пропсами).
import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Modal as UIModal } from '@/components/ui/Modal'
import { roleLabel } from '@/lib/roles/role-label'
import { useLang } from '@/lib/i18n/LanguageContext'
import type { TemplateListRow, StageTemplate, Final, TaskTemplate, Transition, Role, T } from './workflow-shared'
import { ASSIGNEE_TYPES, PRIORITIES, inputStyle, labelStyle, btnPrimary, btnGhost, btnDanger } from './workflow-shared'

// ── Small building blocks ────────────────────────────────────────────────────
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

export function Modal({ title, error, onClose, children, footer }: {
  title: string
  error: string | null
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <UIModal onClose={onClose} closeOnBackdrop maxWidth={560} panelStyle={{ padding: 22, borderRadius: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>{title}</h2>
      {error && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{error}</div>}
      {children}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>{footer}</div>
    </UIModal>
  )
}

// ── HTTP helper: returns error message string, or null on success ─────────────
export async function mutate(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      return (b as { error?: string }).error ?? `HTTP ${res.status}`
    }
    return null
  } catch {
    return 'network_error'
  }
}

// ── Process create modal ─────────────────────────────────────────────────────
export function ProcessCreateModal({ t, tCommon, onClose, onSaved }: {
  t: T; tCommon: T; onClose: () => void; onSaved: () => void
}) {
  const [code, setCode] = useState('')
  const [nameRu, setNameRu] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!code.trim()) { setErr(t('code_required')); return }
    if (!nameRu.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const e = await mutate('/api/workflow/process-templates', 'POST', {
      code: code.trim(), name_ru: nameRu.trim(), description: description.trim() || undefined,
    })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={t('new_process_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={`${t('f_code')} *`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={code} onChange={e => setCode(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('f_code_hint')}</span>
        </Field>
        <Field label={`${t('f_name_ru')} *`}><input style={inputStyle} value={nameRu} onChange={e => setNameRu(e.target.value)} /></Field>
        <Field label={t('f_description')}><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ── Process edit modal (name_ru / description / is_active) ────────────────────
export function ProcessEditModal({ t, tCommon, template, onClose, onSaved }: {
  t: T; tCommon: T; template: TemplateListRow; onClose: () => void; onSaved: () => void
}) {
  const [nameRu, setNameRu] = useState(template.name_ru)
  const [description, setDescription] = useState(template.description ?? '')
  const [isActive, setIsActive] = useState(template.is_active)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!nameRu.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const e = await mutate(`/api/workflow/process-templates/${template.id}`, 'PATCH', {
      name_ru: nameRu.trim(), description: description.trim() || null, is_active: isActive,
    })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={t('edit_process_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={t('f_code')}><input style={{ ...inputStyle, fontFamily: 'monospace', opacity: 0.7 }} value={template.code} disabled /></Field>
        <Field label={`${t('f_name_ru')} *`}><input style={inputStyle} value={nameRu} onChange={e => setNameRu(e.target.value)} /></Field>
        <Field label={t('f_description')}><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <label style={labelStyle}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          {t('f_active')}
        </label>
      </div>
    </Modal>
  )
}

// ── Stage create/edit modal ──────────────────────────────────────────────────
export function StageModal({ t, tCommon, processId, stage, roles, onClose, onSaved }: {
  t: T; tCommon: T; processId: string; stage: StageTemplate | null
  roles: Role[]; onClose: () => void; onSaved: () => void
}) {
  const { t: lang } = useLang()
  const [code, setCode] = useState(stage?.code ?? '')
  const [nameRu, setNameRu] = useState(stage?.name_ru ?? '')
  const [description, setDescription] = useState(stage?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(stage?.sort_order ?? 0))
  const [hasTasks, setHasTasks] = useState(stage?.has_tasks ?? false)
  const [hasActionLog, setHasActionLog] = useState(stage?.has_action_log ?? true)
  const [isOptional, setIsOptional] = useState(stage?.is_optional ?? false)
  const [isAddable, setIsAddable] = useState(stage?.is_addable ?? false)
  const [requiresSignature, setRequiresSignature] = useState(stage?.requires_signature ?? false)
  const [signerCodes, setSignerCodes] = useState<Set<string>>(
    new Set((stage?.required_role_code ?? '').split(',').map(s => s.trim()).filter(Boolean)),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function toggleSigner(c: string) {
    setSignerCodes(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      return next
    })
  }

  async function save() {
    if (!stage && !code.trim()) { setErr(t('code_required')); return }
    if (!nameRu.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const required_role_code = signerCodes.size ? [...signerCodes].join(',') : null
    const common = {
      name_ru: nameRu.trim(),
      description: description.trim() || null,
      has_tasks: hasTasks,
      has_action_log: hasActionLog,
      is_optional: isOptional,
      is_addable: isAddable,
      sort_order: Number(sortOrder) || 0,
      required_role_code,
      requires_signature: requiresSignature,
    }
    const e = stage
      ? await mutate(`/api/workflow/stage-templates/${stage.id}`, 'PATCH', common)
      : await mutate('/api/workflow/stage-templates', 'POST', { process_template_id: processId, code: code.trim(), ...common })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={stage ? t('edit_stage_title') : t('new_stage_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={`${t('f_stage_code')} ${stage ? '' : '*'}`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace', opacity: stage ? 0.7 : 1 }} value={code} onChange={e => setCode(e.target.value)} disabled={!!stage} />
        </Field>
        <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label={`${t('f_stage_name')} *`}><input style={inputStyle} value={nameRu} onChange={e => setNameRu(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label={t('f_description')}><textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        <label style={labelStyle}><input type="checkbox" checked={hasTasks} onChange={e => setHasTasks(e.target.checked)} />{t('flag_has_tasks')}</label>
        <label style={labelStyle}><input type="checkbox" checked={hasActionLog} onChange={e => setHasActionLog(e.target.checked)} />{t('flag_has_action_log')}</label>
        <label style={labelStyle}><input type="checkbox" checked={isOptional} onChange={e => setIsOptional(e.target.checked)} />{t('flag_is_optional')}</label>
        <label style={labelStyle}><input type="checkbox" checked={isAddable} onChange={e => setIsAddable(e.target.checked)} />{t('flag_is_addable')}</label>
      </div>

      {/* Who signs — headline feature */}
      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t('who_signs_label')}</div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, marginBottom: 8 }}>{t('required_role_hint')}</div>
        <label style={{ ...labelStyle, marginBottom: 10 }}>
          <input type="checkbox" checked={requiresSignature} onChange={e => setRequiresSignature(e.target.checked)} />
          {t('f_requires_signature')}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
          {roles.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('roles_none_available')}</span>
          ) : roles.map(r => (
            <label key={r.id} style={{ ...labelStyle, fontSize: 12.5 }}>
              <input type="checkbox" checked={signerCodes.has(r.code)} onChange={() => toggleSigner(r.code)} />
              <span>{roleLabel(lang.roles, r.code, r.name)} <span style={{ color: 'var(--text-faint)', fontFamily: 'monospace', fontSize: 11 }}>{r.code}</span></span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
          {signerCodes.size ? [...signerCodes].map(c => roleLabel(lang.roles, c)).join(', ') : t('who_signs_none')}
        </div>
      </div>
    </Modal>
  )
}

// ── Final create/edit modal ──────────────────────────────────────────────────
export function FinalModal({ t, tCommon, stageId, final, onClose, onSaved }: {
  t: T; tCommon: T; stageId: string; final: Final | null; onClose: () => void; onSaved: () => void
}) {
  const [code, setCode] = useState(final?.code ?? '')
  const [nameRu, setNameRu] = useState(final?.name_ru ?? '')
  const [isPositive, setIsPositive] = useState(final?.is_positive ?? true)
  const [closesProcess, setClosesProcess] = useState(final?.closes_process ?? false)
  const [finishReason, setFinishReason] = useState(final?.process_finish_reason ?? '')
  const [sortOrder, setSortOrder] = useState(String(final?.sort_order ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!final && !code.trim()) { setErr(t('code_required')); return }
    if (!nameRu.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const common = {
      name_ru: nameRu.trim(),
      is_positive: isPositive,
      closes_process: closesProcess,
      process_finish_reason: closesProcess ? (finishReason.trim() || null) : null,
      sort_order: Number(sortOrder) || 0,
    }
    const e = final
      ? await mutate(`/api/workflow/stage-finals/${final.id}`, 'PATCH', common)
      : await mutate('/api/workflow/stage-finals', 'POST', { stage_template_id: stageId, code: code.trim(), ...common })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={final ? t('edit_final_title') : t('new_final_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={`${t('f_final_code')} ${final ? '' : '*'}`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace', opacity: final ? 0.7 : 1 }} value={code} onChange={e => setCode(e.target.value)} disabled={!!final} />
        </Field>
        <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label={`${t('f_final_name')} *`}><input style={inputStyle} value={nameRu} onChange={e => setNameRu(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={() => setIsPositive(true)} style={{ ...btnGhost, borderColor: isPositive ? 'var(--success)' : 'var(--border-strong)', color: isPositive ? 'var(--success)' : 'var(--text-muted)', background: isPositive ? 'var(--success-tint)' : 'var(--surface)' }}>{t('positive')}</button>
        <button type="button" onClick={() => setIsPositive(false)} style={{ ...btnGhost, borderColor: !isPositive ? 'var(--danger)' : 'var(--border-strong)', color: !isPositive ? 'var(--danger)' : 'var(--text-muted)', background: !isPositive ? 'var(--danger-tint)' : 'var(--surface)' }}>{t('negative')}</button>
      </div>
      <label style={{ ...labelStyle, marginTop: 14 }}>
        <input type="checkbox" checked={closesProcess} onChange={e => setClosesProcess(e.target.checked)} />
        {t('f_closes_process')}
      </label>
      {closesProcess && (
        <div style={{ marginTop: 12 }}>
          <Field label={t('f_finish_reason')}>
            <input style={inputStyle} value={finishReason} onChange={e => setFinishReason(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('finish_reason_hint')}</span>
          </Field>
        </div>
      )}
    </Modal>
  )
}

// ── Task create/edit modal ───────────────────────────────────────────────────
export function TaskModal({ t, tCommon, stageId, task, roles, onClose, onSaved }: {
  t: T; tCommon: T; stageId: string; task: TaskTemplate | null; roles: Role[]; onClose: () => void; onSaved: () => void
}) {
  const { t: lang } = useLang()
  const [code, setCode] = useState(task?.code ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assigneeType, setAssigneeType] = useState(task?.default_assignee_type ?? '')
  const [roleCode, setRoleCode] = useState(task?.default_role_code ?? '')
  const [departmentId, setDepartmentId] = useState(task?.default_department_id ?? '')
  const [priority, setPriority] = useState(task?.default_priority ?? '')
  const [dueDays, setDueDays] = useState(task?.default_due_days != null ? String(task.default_due_days) : '')
  const [sortOrder, setSortOrder] = useState(String(task?.sort_order ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!task && !code.trim()) { setErr(t('code_required')); return }
    if (!title.trim()) { setErr(t('title_required')); return }
    setBusy(true); setErr(null)
    const common = {
      title: title.trim(),
      description: description.trim() || null,
      default_assignee_type: assigneeType || null,
      default_role_code: assigneeType === 'role' ? (roleCode || null) : null,
      default_department_id: assigneeType === 'department' ? (departmentId.trim() || null) : null,
      default_priority: priority || null,
      default_due_days: dueDays.trim() !== '' ? Number(dueDays) : null,
      sort_order: Number(sortOrder) || 0,
    }
    const e = task
      ? await mutate(`/api/workflow/stage-task-templates/${task.id}`, 'PATCH', common)
      : await mutate('/api/workflow/stage-task-templates', 'POST', { stage_template_id: stageId, code: code.trim(), ...common })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={task ? t('edit_task_title') : t('new_task_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={`${t('f_task_code')} ${task ? '' : '*'}`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace', opacity: task ? 0.7 : 1 }} value={code} onChange={e => setCode(e.target.value)} disabled={!!task} />
        </Field>
        <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label={`${t('f_task_title')} *`}><input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label={t('f_description')}><textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Field label={t('f_assignee_type')}>
          <select style={inputStyle} value={assigneeType} onChange={e => setAssigneeType(e.target.value)}>
            <option value="">—</option>
            {ASSIGNEE_TYPES.map(a => <option key={a} value={a}>{t('at_' + a)}</option>)}
          </select>
        </Field>
        {assigneeType === 'role' && (
          <Field label={t('f_assignee_role')}>
            <select style={inputStyle} value={roleCode} onChange={e => setRoleCode(e.target.value)}>
              <option value="">—</option>
              {roles.map(r => <option key={r.id} value={r.code}>{roleLabel(lang.roles, r.code, r.name)} ({r.code})</option>)}
            </select>
          </Field>
        )}
        {assigneeType === 'department' && (
          <Field label={t('f_assignee_department')}>
            <input style={inputStyle} value={departmentId} onChange={e => setDepartmentId(e.target.value)} />
          </Field>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Field label={t('f_priority')}>
          <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="">—</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{t('pr_' + p)}</option>)}
          </select>
        </Field>
        <Field label={t('f_due_days')}><input type="number" style={inputStyle} value={dueDays} onChange={e => setDueDays(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ── Transition create/edit modal ─────────────────────────────────────────────
export function TransitionModal({ t, tCommon, stages, finals, transition, onClose, onSaved }: {
  t: T; tCommon: T; stages: StageTemplate[]; finals: Final[]; transition: Transition | null; onClose: () => void; onSaved: () => void
}) {
  const [fromStage, setFromStage] = useState<string>(transition?.from_stage_template_id ?? '')
  const [toStage, setToStage] = useState<string>(transition?.to_stage_template_id ?? '')
  const [triggerFinal, setTriggerFinal] = useState<string>(transition?.trigger_final_code ?? '')
  const [activationMode, setActivationMode] = useState<string>(transition?.activation_mode ?? 'after_one')
  const [sortOrder, setSortOrder] = useState(String(transition?.sort_order ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Finals belonging to the selected FROM stage (matched by code select).
  const fromFinals = useMemo(
    () => finals.filter(f => f.stage_template_id === fromStage),
    [finals, fromStage],
  )

  async function save() {
    if (!toStage) { setErr(t('to_stage_required')); return }
    setBusy(true); setErr(null)
    const payload = {
      from_stage_template_id: fromStage || null,
      to_stage_template_id: toStage,
      trigger_final_code: triggerFinal || null,
      activation_mode: activationMode,
      sort_order: Number(sortOrder) || 0,
    }
    const e = transition
      ? await mutate(`/api/workflow/stage-transitions/${transition.id}`, 'PATCH', payload)
      : await mutate('/api/workflow/stage-transitions', 'POST', payload)
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={transition ? t('edit_transition_title') : t('new_transition_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <button onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={t('f_from_stage')}>
          <select style={inputStyle} value={fromStage} onChange={e => { setFromStage(e.target.value); setTriggerFinal('') }}>
            <option value="">{t('from_start_option')}</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name_ru} ({s.code})</option>)}
          </select>
        </Field>
        <Field label={`${t('f_to_stage')} *`}>
          <select style={inputStyle} value={toStage} onChange={e => setToStage(e.target.value)}>
            <option value="">—</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name_ru} ({s.code})</option>)}
          </select>
        </Field>
        <Field label={t('f_trigger_final')}>
          <select style={inputStyle} value={triggerFinal} onChange={e => setTriggerFinal(e.target.value)} disabled={!fromStage}>
            <option value="">{t('any_final_option')}</option>
            {fromFinals.map(f => <option key={f.id} value={f.code}>{f.name_ru} ({f.code})</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label={t('f_activation_mode')}>
            <select style={inputStyle} value={activationMode} onChange={e => setActivationMode(e.target.value)}>
              <option value="after_one">{t('mode_after_one')}</option>
              <option value="after_all">{t('mode_after_all')}</option>
            </select>
          </Field>
          <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>{t('mode_help')}</div>
      </div>
    </Modal>
  )
}
