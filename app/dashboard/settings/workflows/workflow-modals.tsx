'use client'

// Модальные формы редактора workflow-шаблонов. Вынесено из WorkflowsClient.tsx
// для разгрузки монолита; поведение не менялось. Каждая модалка самодостаточна
// (данные/колбэки — пропсами).
import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Modal as UIModal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { roleLabel } from '@/lib/roles/role-label'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { stageName, finalName } from '@/lib/workflow/labels'
import type { TemplateListRow, StageTemplate, Final, TaskTemplate, Transition, Role, T } from './workflow-shared'
import { ASSIGNEE_TYPES, PRIORITIES, inputStyle, labelStyle, btnPrimary, btnGhost } from './workflow-shared'

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

// ── Название / описание на трёх языках ───────────────────────────────────────
// Иврит и английский — переопределения: пустое поле = показывается стандартный
// перевод системы (он же подставлен как подсказка в поле на языке интерфейса).
// Русское название — внутреннее имя шаблона (обязательное; в нём движок пишет
// системные события); в русском интерфейсе оно видно, только если у кода нет
// стандартного перевода.
export interface I18nText { he: string; en: string; ru: string }

export function NameFields({ t, value, onChange, standard }: {
  t: T
  value: I18nText
  onChange: (v: I18nText) => void
  /** Стандартный перевод на языке интерфейса — подсказка в пустом поле. */
  standard?: string
}) {
  const { lang } = useLang()
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label={t('f_name_he')}>
        <input style={inputStyle} dir="rtl" value={value.he} placeholder={lang === 'he' ? standard : undefined}
          onChange={e => onChange({ ...value, he: e.target.value })} />
      </Field>
      <Field label={t('f_name_en')}>
        <input style={inputStyle} dir="ltr" value={value.en} placeholder={lang === 'en' ? standard : undefined}
          onChange={e => onChange({ ...value, en: e.target.value })} />
      </Field>
      <Field label={`${t('f_name_ru')} *`}>
        <input style={inputStyle} dir="ltr" value={value.ru} onChange={e => onChange({ ...value, ru: e.target.value })} />
      </Field>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('name_i18n_hint')}</span>
    </div>
  )
}

export function DescriptionFields({ t, value, onChange }: {
  t: T; value: I18nText; onChange: (v: I18nText) => void
}) {
  const area = { ...inputStyle, minHeight: 52, resize: 'vertical' as const }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label={t('f_description_he')}><textarea style={area} dir="rtl" value={value.he} onChange={e => onChange({ ...value, he: e.target.value })} /></Field>
      <Field label={t('f_description_en')}><textarea style={area} dir="ltr" value={value.en} onChange={e => onChange({ ...value, en: e.target.value })} /></Field>
      <Field label={t('f_description_ru')}><textarea style={area} dir="ltr" value={value.ru} onChange={e => onChange({ ...value, ru: e.target.value })} /></Field>
    </div>
  )
}

function namesOf(row: { name_ru: string; name_he?: string | null; name_en?: string | null } | null | undefined): I18nText {
  return { he: row?.name_he ?? '', en: row?.name_en ?? '', ru: row?.name_ru ?? '' }
}
function descOf(row: { description: string | null; description_he?: string | null; description_en?: string | null } | null | undefined): I18nText {
  return { he: row?.description_he ?? '', en: row?.description_en ?? '', ru: row?.description ?? '' }
}
/** Тело запроса: he/en пустые → null (= стандартный перевод). */
function namesBody(v: I18nText) {
  return { name_ru: v.ru.trim(), name_he: v.he.trim() || null, name_en: v.en.trim() || null }
}
function descBody(v: I18nText) {
  return { description: v.ru.trim() || null, description_he: v.he.trim() || null, description_en: v.en.trim() || null }
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
  const [names, setNames] = useState<I18nText>(namesOf(null))
  const [desc, setDesc] = useState<I18nText>(descOf(null))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!code.trim()) { setErr(t('code_required')); return }
    if (!names.ru.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const e = await mutate('/api/workflow/process-templates', 'POST', {
      code: code.trim(), ...namesBody(names), ...descBody(desc),
    })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={t('new_process_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={`${t('f_code')} *`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={code} onChange={e => setCode(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('f_code_hint')}</span>
        </Field>
        <NameFields t={t} value={names} onChange={setNames} />
        <DescriptionFields t={t} value={desc} onChange={setDesc} />
      </div>
    </Modal>
  )
}

// ── Process edit modal (названия / описания на трёх языках, is_active) ─────────
export function ProcessEditModal({ t, tCommon, template, standardName, onClose, onSaved }: {
  t: T; tCommon: T; template: TemplateListRow; standardName?: string; onClose: () => void; onSaved: () => void
}) {
  const [names, setNames] = useState<I18nText>(namesOf(template))
  const [desc, setDesc] = useState<I18nText>(descOf(template))
  const [isActive, setIsActive] = useState(template.is_active)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!names.ru.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const e = await mutate(`/api/workflow/process-templates/${template.id}`, 'PATCH', {
      ...namesBody(names), ...descBody(desc), is_active: isActive,
    })
    setBusy(false)
    if (e) { setErr(e); return }
    onSaved()
  }

  return (
    <Modal title={t('edit_process_title')} error={err} onClose={onClose} footer={
      <>
        <button onClick={onClose} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={t('f_code')}><input style={{ ...inputStyle, fontFamily: 'monospace', opacity: 0.7 }} value={template.code} disabled /></Field>
        <NameFields t={t} value={names} onChange={setNames} standard={standardName} />
        <DescriptionFields t={t} value={desc} onChange={setDesc} />
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
  const { t: lang, lang: locale } = useLang()
  const tEdu = useTranslations('education')
  const [code, setCode] = useState(stage?.code ?? '')
  const [names, setNames] = useState<I18nText>(namesOf(stage))
  const [desc, setDesc] = useState<I18nText>(descOf(stage))
  const [sortOrder, setSortOrder] = useState(String(stage?.sort_order ?? 0))
  const [hasTasks, setHasTasks] = useState(stage?.has_tasks ?? false)
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
    if (!names.ru.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const required_role_code = signerCodes.size ? [...signerCodes].join(',') : null
    const common = {
      ...namesBody(names),
      ...descBody(desc),
      has_tasks: hasTasks,
      // has_action_log / is_optional / is_addable убраны из формы (S7): ни код,
      // ни SQL их не читают. Не отправляем — значения в БД остаются как были.
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
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={`${t('f_stage_code')} ${stage ? '' : '*'}`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace', opacity: stage ? 0.7 : 1 }} value={code} onChange={e => setCode(e.target.value)} disabled={!!stage} />
        </Field>
        <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <NameFields t={t} value={names} onChange={setNames}
          standard={stage ? stageName({ ...stage, name_he: null, name_en: null }, locale, tEdu) : undefined} />
      </div>
      <div style={{ marginTop: 12 }}>
        <DescriptionFields t={t} value={desc} onChange={setDesc} />
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}><input type="checkbox" checked={hasTasks} onChange={e => setHasTasks(e.target.checked)} />{t('flag_has_tasks')}</label>
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
export function FinalModal({ t, tCommon, stageId, stageCode, final, onClose, onSaved }: {
  t: T; tCommon: T; stageId: string; stageCode?: string; final: Final | null; onClose: () => void; onSaved: () => void
}) {
  const { lang: locale } = useLang()
  const tEdu = useTranslations('education')
  const [code, setCode] = useState(final?.code ?? '')
  const [names, setNames] = useState<I18nText>(namesOf(final))
  const [isPositive, setIsPositive] = useState(final?.is_positive ?? true)
  const [closesProcess, setClosesProcess] = useState(final?.closes_process ?? false)
  const [finishReason, setFinishReason] = useState(final?.process_finish_reason ?? '')
  const [sortOrder, setSortOrder] = useState(String(final?.sort_order ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!final && !code.trim()) { setErr(t('code_required')); return }
    if (!names.ru.trim()) { setErr(t('name_required')); return }
    setBusy(true); setErr(null)
    const common = {
      ...namesBody(names),
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
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={`${t('f_final_code')} ${final ? '' : '*'}`}>
          <input style={{ ...inputStyle, fontFamily: 'monospace', opacity: final ? 0.7 : 1 }} value={code} onChange={e => setCode(e.target.value)} disabled={!!final} />
        </Field>
        <Field label={t('f_sort_order')}><input type="number" style={inputStyle} value={sortOrder} onChange={e => setSortOrder(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <NameFields t={t} value={names} onChange={setNames}
          standard={final ? finalName(stageCode, { ...final, name_he: null, name_en: null }, locale, tEdu) : undefined} />
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
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
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
            {/* «role» движок не обрабатывает (задача создаётся без исполнителя) —
                для новых задач не предлагаем; у старых показываем с пометкой (S1). */}
            {ASSIGNEE_TYPES.filter(a => a !== 'role' || assigneeType === 'role').map(a => <option key={a} value={a}>{t('at_' + a)}</option>)}
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
        <Field label={t('f_due_days')}>
          <input type="number" style={inputStyle} value={dueDays} onChange={e => setDueDays(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('f_due_days_hint')}</span>
        </Field>
      </div>
    </Modal>
  )
}

// ── Transition create/edit modal ─────────────────────────────────────────────
export function TransitionModal({ t, tCommon, stages, finals, transition, onClose, onSaved }: {
  t: T; tCommon: T; stages: StageTemplate[]; finals: Final[]; transition: Transition | null; onClose: () => void; onSaved: () => void
}) {
  const { lang: locale } = useLang()
  const tEdu = useTranslations('education')
  const stageCodeById = useMemo(() => new Map(stages.map(s => [s.id, s.code])), [stages])
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
        <SubmitButton onClick={save} loading={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</SubmitButton>
      </>
    }>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label={t('f_from_stage')}>
          <select style={inputStyle} value={fromStage} onChange={e => { setFromStage(e.target.value); setTriggerFinal('') }}>
            <option value="">{t('from_start_option')}</option>
            {stages.map(s => <option key={s.id} value={s.id}>{stageName(s, locale, tEdu)}</option>)}
          </select>
        </Field>
        <Field label={`${t('f_to_stage')} *`}>
          <select style={inputStyle} value={toStage} onChange={e => setToStage(e.target.value)}>
            <option value="">—</option>
            {stages.map(s => <option key={s.id} value={s.id}>{stageName(s, locale, tEdu)}</option>)}
          </select>
        </Field>
        <Field label={t('f_trigger_final')}>
          <select style={inputStyle} value={triggerFinal} onChange={e => setTriggerFinal(e.target.value)} disabled={!fromStage}>
            <option value="">{t('any_final_option')}</option>
            {fromFinals.map(f => <option key={f.id} value={f.code}>{finalName(stageCodeById.get(f.stage_template_id), f, locale, tEdu)}</option>)}
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
