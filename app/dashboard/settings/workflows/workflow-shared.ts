// Общие типы/константы/стили редактора workflow-шаблонов. Вынесено из
// WorkflowsClient.tsx, чтобы и контейнер, и модалки ссылались на один источник.
import type { CSSProperties } from 'react'

// ── Types (mirror API row shapes exactly) ────────────────────────────────────
export interface TemplateListRow {
  id: string
  code: string
  name_ru: string
  description: string | null
  is_active: boolean
}
export interface StageTemplate {
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
export interface Final {
  id: string
  stage_template_id: string
  code: string
  name_ru: string
  is_positive: boolean
  closes_process: boolean
  process_finish_reason: string | null
  sort_order: number
}
export interface TaskTemplate {
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
export interface Transition {
  id: string
  from_stage_template_id: string | null
  to_stage_template_id: string
  trigger_final_code: string | null
  activation_mode: string
  sort_order: number
}
export interface TemplateDetail {
  template: TemplateListRow
  stages: StageTemplate[]
  task_templates: TaskTemplate[]
  finals: Final[]
  transitions: Transition[]
}
export interface Role {
  id: string
  code: string
  name: string
  category: string
}

export type T = (key: string, fallback?: string) => string

export const ASSIGNEE_TYPES = ['role', 'department', 'creator', 'manual'] as const
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

// ── Shared styles ────────────────────────────────────────────────────────────
export const inputStyle: CSSProperties = {
  width: '100%', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', background: 'var(--surface)',
}
export const labelStyle: CSSProperties = {
  display: 'inline-flex', gap: 8, alignItems: 'center',
  fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
}
export const btnPrimary: CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none',
  borderRadius: 8, background: 'var(--accent-strong)', color: '#fff', cursor: 'pointer',
}
export const btnGhost: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: '5px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
}
export const btnDanger: CSSProperties = {
  fontSize: 12.5, fontWeight: 600, padding: '5px 10px',
  border: '1px solid var(--danger)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer',
}
