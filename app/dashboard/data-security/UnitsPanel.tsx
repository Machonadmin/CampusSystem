'use client'

import { useCallback, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import type { UnitNode } from '@/lib/data-security/units'
import { flattenUnits } from '@/lib/data-security/units'
import { cardStyle, type T } from './shared'

// ─── Учебные единицы: НАСТОЯЩАЯ граница доступа ──────────────────────────────
//
// Отличие от дерева прав рядом — принципиальное, и экран обязан его проговорить:
// там перестановка косметическая, здесь перенос единицы меняет то, что люди
// видят, прямо сейчас. Поэтому панель предупреждает об этом прямым текстом и
// закрыта отдельным правом (manage_units).
//
// Сценарий, ради которого она сделана: «Колледж» с двумя потоками внутри.
// Руководитель сидит на «Колледже» и видит оба; секретарь сидит на потоке и
// видит только его.

interface UnitForm {
  id?: string
  parent_id: string | null
  name_he: string
  name: string
  name_en: string
}

export default function UnitsPanel({ units, canManageUnits, t, onReload }: {
  units: UnitNode[]
  canManageUnits: boolean
  t: T
  onReload: (next: UnitNode[]) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(units.map(u => u.id)))
  const [editing, setEditing] = useState<UnitForm | null>(null)
  const [busy, setBusy] = useState(false)

  const flat = flattenUnits(units)

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const send = useCallback(async (init: RequestInit, url = '/api/data-security/units') => {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // Отказ удаления объясняем по-человечески, а не кодом состояния.
        toastError(body?.code === 'structure_has_children' ? t('units_has_children')
          : body?.code === 'structure_has_groups' ? t('units_has_staff')
          : body?.error || t('save_error'))
        return false
      }
      onReload(body.units as UnitNode[])
      toastSuccess(t('saved'))
      return true
    } catch {
      toastError(t('save_error'))
      return false
    } finally { setBusy(false) }
  }, [onReload, t])

  const remove = async (node: UnitNode) => {
    if (!(await confirmDialog({ message: t('units_delete_confirm'), tone: 'danger' }))) return
    await send({ method: 'DELETE' }, `/api/data-security/units?id=${encodeURIComponent(node.id)}`)
  }

  const renderNode = (node: UnitNode, depth: number) => {
    const open = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div className="ds-row" style={{
          padding: '8px 12px', paddingInlineStart: 12 + Math.min(depth, 3) * 16,
          borderRadius: 8,
        }}>
          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(node.id)}
              aria-expanded={open}
              style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px' }}
            >{open ? '▾' : '◂'}</button>
          ) : <span style={{ width: 17 }} />}

          <span className="ds-grow" style={{
            fontSize: depth === 0 ? 14 : 13.5,
            fontWeight: depth === 0 ? 700 : 600, color: 'var(--text)',
            overflowWrap: 'anywhere',
          }}>{node.name}</span>

          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {t('units_seats').replace('{n}', String(node.seatCount))}
            {node.seatCountDeep !== node.seatCount &&
              ` · ${t('units_seats_deep').replace('{n}', String(node.seatCountDeep))}`}
          </span>

          {canManageUnits && (
            <span style={{ display: 'flex', gap: 2 }}>
              <IconBtn label={t('units_new_under').replace('{name}', node.name)} disabled={busy}
                onClick={() => setEditing({ parent_id: node.id, name_he: '', name: '', name_en: '' })}>+</IconBtn>
              <IconBtn label={t('units_edit')} disabled={busy}
                onClick={() => setEditing({ id: node.id, parent_id: node.parentId, name_he: node.name, name: '', name_en: '' })}>✎</IconBtn>
              <IconBtn label={t('units_delete')} disabled={busy} onClick={() => remove(node)}>✕</IconBtn>
            </span>
          )}
        </div>
        {open && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, padding: '14px 10px', marginBottom: 16, borderInlineStart: '3px solid var(--danger)' }}>
      <div className="ds-row" style={{ padding: '0 6px 8px' }}>
        <span className="ds-grow" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('units_title')}</span>
        {canManageUnits && (
          <button
            onClick={() => setEditing({ parent_id: null, name_he: '', name: '', name_en: '' })}
            style={{
              padding: '7px 14px', borderRadius: 9, border: 0,
              background: getModuleColor('data_security'), color: '#fff',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >+ {t('units_new')}</button>
        )}
      </div>

      <p style={{ margin: '0 6px 10px', fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>
        {canManageUnits ? t('units_hint') : t('units_no_permission')}
      </p>

      {units.map(u => renderNode(u, 0))}

      {editing && (
        <UnitEditor
          form={editing}
          options={flat}
          t={t}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            const ok = await send({
              method: payload.id ? 'PATCH' : 'POST',
              body: JSON.stringify(payload),
            })
            if (ok) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function IconBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      aria-label={label} title={label} onClick={onClick} disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
        background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12,
        cursor: disabled ? 'default' : 'pointer', lineHeight: 1,
      }}
    >{children}</button>
  )
}

function UnitEditor({ form, options, t, busy, onClose, onSave }: {
  form: UnitForm
  options: { id: string; label: string; depth: number }[]
  t: T
  busy: boolean
  onClose: () => void
  onSave: (payload: UnitForm) => void
}) {
  const [state, setState] = useState(form)
  const [err, setErr] = useState('')

  const field = (key: 'name_he' | 'name' | 'name_en', label: string) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      <input
        type="text"
        value={state[key]}
        onChange={e => setState(s => ({ ...s, [key]: e.target.value }))}
        style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
      />
    </label>
  )

  return (
    <Modal onClose={onClose} maxWidth={460} ariaLabel={state.id ? t('units_edit') : t('units_new')}>
      <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
        {state.id ? t('units_edit') : t('units_new')}
      </h2>

      {field('name_he', t('units_name_he'))}
      {field('name', t('units_name_ru'))}
      {field('name_en', t('units_name_en'))}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('units_parent')}</span>
        <select
          value={state.parent_id ?? ''}
          onChange={e => setState(s => ({ ...s, parent_id: e.target.value || null }))}
          style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        >
          <option value="">{t('units_parent_root')}</option>
          {options
            .filter(o => o.id !== state.id)
            .map(o => (
              <option key={o.id} value={o.id}>{' '.repeat(o.depth * 3)}{o.label}</option>
            ))}
        </select>
      </label>

      <p style={{ margin: '0 0 12px', padding: '9px 11px', borderRadius: 8, background: 'var(--danger-tint)', fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>
        {t('units_hint')}
      </p>

      {err && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--danger)' }}>{err}</p>}

      <SubmitButton
        loading={busy}
        onClick={() => {
          if (!state.name_he.trim()) { setErr(t('name_he_required')); return }
          setErr('')
          onSave(state)
        }}
        style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 0, background: getModuleColor('data_security'), color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >{t('save')}</SubmitButton>
    </Modal>
  )
}
