'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { roleLabel } from '@/lib/roles/role-label'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

/**
 * Визуальный редактор ШАБЛОНОВ ПРОЦЕССОВ (process templates) — основа
 * workflow приёмки/рекрутинга. Чтение доступно любому авторизованному
 * пользователю; все мутации требуют роли superadmin (сервер вернёт 403).
 * Все контролы правки скрыты за пропом canEdit.
 */

// ── Types (mirror API row shapes exactly) ────────────────────────────────────
interface TemplateListRow {
  id: string
  code: string
  name_ru: string
  description: string | null
  is_active: boolean
}
interface StageTemplate {
  id: string
  process_template_id: string
  code: string
  name_ru: string
  description: string | null
  has_tasks: boolean
  has_action_log: boolean
  is_optional: boolean
  is_addable: boolean
  sort_order: number
  required_role_code: string | null
  requires_signature: boolean
}
interface Final {
  id: string
  stage_template_id: string
  code: string
  name_ru: string
  is_positive: boolean
  closes_process: boolean
  process_finish_reason: string | null
  sort_order: number
}
interface TaskTemplate {
  id: string
  stage_template_id: string
  code: string
  title: string
  description: string | null
  default_assignee_type: string | null
  default_role_code: string | null
  default_department_id: string | null
  default_priority: string | null
  default_due_days: number | null
  sort_order: number
}
interface Transition {
  id: string
  from_stage_template_id: string | null
  to_stage_template_id: string
  trigger_final_code: string | null
  activation_mode: string
  sort_order: number
}
interface TemplateDetail {
  template: TemplateListRow
  stages: StageTemplate[]
  task_templates: TaskTemplate[]
  finals: Final[]
  transitions: Transition[]
}
interface Role {
  id: string
  code: string
  name: string
  category: string
}

type T = (key: string, fallback?: string) => string

const ASSIGNEE_TYPES = ['role', 'department', 'creator', 'manual'] as const
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

// ── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: CSSProperties = {
  width: '100%', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', background: 'var(--surface)',
}
const labelStyle: CSSProperties = {
  display: 'inline-flex', gap: 8, alignItems: 'center',
  fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
}
const btnPrimary: CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none',
  borderRadius: 8, background: 'var(--accent-strong)', color: '#fff', cursor: 'pointer',
}
const btnGhost: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: '5px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
}
const btnDanger: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: '5px 10px',
  border: '1px solid var(--danger)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer',
}

// ── Small building blocks ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}

function Modal({ title, error, onClose, children, footer }: {
  title: string
  error: string | null
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>{title}</h2>
        {error && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{error}</div>}
        {children}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>{footer}</div>
      </div>
    </div>
  )
}

// ── HTTP helper: returns error message string, or null on success ─────────────
async function mutate(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
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
function ProcessCreateModal({ t, tCommon, onClose, onSaved }: {
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
function ProcessEditModal({ t, tCommon, template, onClose, onSaved }: {
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
function StageModal({ t, tCommon, processId, stage, roles, onClose, onSaved }: {
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
function FinalModal({ t, tCommon, stageId, final, onClose, onSaved }: {
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
        <button type="button" onClick={() => setIsPositive(true)} style={{ ...btnGhost, borderColor: isPositive ? '#16A34A' : 'var(--border-strong)', color: isPositive ? '#16A34A' : 'var(--text-muted)', background: isPositive ? '#F0FDF4' : 'var(--surface)' }}>{t('positive')}</button>
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
function TaskModal({ t, tCommon, stageId, task, roles, onClose, onSaved }: {
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
function TransitionModal({ t, tCommon, stages, finals, transition, onClose, onSaved }: {
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
    if (!window.confirm(t('deactivate_confirm'))) return
    const e = await mutate(`/api/workflow/process-templates/${detail.template.id}`, 'DELETE')
    if (e) { setErr(e); return }
    await refetch()
  }

  async function deleteStage(s: StageTemplate) {
    if (!window.confirm(t('delete_stage_confirm'))) return
    const e = await mutate(`/api/workflow/stage-templates/${s.id}`, 'DELETE')
    if (e) { setErr(t(e, e)); return }
    await refetch()
  }
  async function deleteFinal(f: Final) {
    if (!window.confirm(t('delete_final_confirm'))) return
    const e = await mutate(`/api/workflow/stage-finals/${f.id}`, 'DELETE')
    if (e) { setErr(t(e, e)); return }
    await refetch()
  }
  async function deleteTask(task: TaskTemplate) {
    if (!window.confirm(t('delete_task_confirm'))) return
    const e = await mutate(`/api/workflow/stage-task-templates/${task.id}`, 'DELETE')
    if (e) { setErr(e); return }
    await refetch()
  }
  async function deleteTransition(tr: Transition) {
    if (!window.confirm(t('delete_transition_confirm'))) return
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Left: process list ── */}
        <div style={{ width: 280, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: detail.template.is_active ? '#16A34A' : 'var(--text-faint)', background: detail.template.is_active ? '#F0FDF4' : 'var(--surface-2)', padding: '2px 8px', borderRadius: 6 }}>
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
