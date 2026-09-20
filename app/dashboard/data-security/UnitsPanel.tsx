'use client'

import { useCallback, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import type { UnitNode } from '@/lib/data-security/units'
import { flattenUnits } from '@/lib/data-security/units'
import type { StaffSummary } from '@/lib/data-security/load'
import { personSeats, withSeat, withoutSeat, toSeatPayload } from '@/lib/data-security/seating'
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
//
// ─── Посадка людей прямо отсюда ─────────────────────────────────────────────
//
// Раньше посадить человека можно было только с другой стороны — открыть его
// карточку и выбрать ему единицы. Владелец попросил обратное направление:
// «стою на единице и добавляю ей людей». Когда наводишь порядок в структуре,
// думаешь именно так.
//
// Права из дерева НЕ выдаются — только ссылка на карточку. Посадка решает,
// КОГО человек видит; право — ЧТО ему можно. Их разделение и есть смысл
// модуля, и смешать их здесь значило бы вернуть ту кашу, которую разгребали.

interface UnitForm {
  id?: string
  parent_id: string | null
  name_he: string
  name: string
  name_en: string
}

export default function UnitsPanel({ units, staff, canManageUnits, t, onReload, onOpenPerson }: {
  units: UnitNode[]
  staff: StaffSummary[]
  canManageUnits: boolean
  t: T
  onReload: (next: UnitNode[]) => void
  /** Перейти к карточке человека во вкладке «по сотруднику». */
  onOpenPerson: (personId: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(units.map(u => u.id)))
  const [editing, setEditing] = useState<UnitForm | null>(null)
  const [busy, setBusy] = useState(false)
  /** Единицы, у которых раскрыт список людей. Отдельно от вложенных единиц. */
  const [peopleOpen, setPeopleOpen] = useState<Set<string>>(() => new Set())
  /** Единица, в которой сейчас открыт выбор человека. */
  const [adding, setAdding] = useState<string | null>(null)

  const nameOf = (personId: string) =>
    staff.find(s => s.personId === personId)?.name ?? personId

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

  const togglePeople = (id: string) =>
    setPeopleOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  /**
   * Сохраняет ПОЛНЫЙ набор единиц человека. Маршрут посадки заменяет набор
   * целиком, поэтому набор собирается чистыми функциями (lib/data-security/
   * seating.ts) — потерять там чужую единицу значит молча выселить человека
   * оттуда, где его никто не трогал.
   *
   * Ответ маршрута — карточка человека, а не дерево, поэтому дерево
   * перечитывается отдельным GET: иначе счётчики на экране разошлись бы с БД.
   */
  const saveSeats = async (personId: string, next: ReturnType<typeof personSeats>) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/data-security/person/${personId}/seat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSeatPayload(next)),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { toastError(body?.error || t('save_error')); return }

      const fresh = await fetch('/api/data-security/units')
      if (fresh.ok) {
        const data = await fresh.json().catch(() => null)
        if (data?.units) onReload(data.units as UnitNode[])
      }
      toastSuccess(t('saved'))
    } catch {
      toastError(t('save_error'))
    } finally { setBusy(false) }
  }

  const addPerson = async (unitId: string, personId: string) => {
    setAdding(null)
    await saveSeats(personId, withSeat(personSeats(units, personId), unitId, false))
  }

  const removePerson = async (unitId: string, personId: string) => {
    const ok = await confirmDialog({
      message: t('unit_remove_confirm').replace('{name}', nameOf(personId)),
      tone: 'danger',
    })
    if (!ok) return
    await saveSeats(personId, withoutSeat(personSeats(units, personId), unitId))
  }

  const toggleHead = async (unitId: string, personId: string, isHead: boolean) => {
    await saveSeats(personId, withSeat(personSeats(units, personId), unitId, !isHead))
  }

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

          {/* Имя — кнопка: открывает, КТО здесь сидит. Стрелка слева
              по-прежнему раскрывает вложенные единицы: это два разных вопроса
              и смешивать их в одном клике было бы путаницей. */}
          <button
            onClick={() => togglePeople(node.id)}
            aria-expanded={peopleOpen.has(node.id)}
            className="ds-grow"
            style={{
              border: 0, background: 'none', cursor: 'pointer', textAlign: 'start', padding: 0,
              fontSize: depth === 0 ? 14 : 13.5,
              fontWeight: depth === 0 ? 700 : 600, color: 'var(--text)',
              overflowWrap: 'anywhere',
            }}
          >{node.name}</button>

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
        {peopleOpen.has(node.id) && (
          <div className="anim-expand" style={{
            margin: `2px 0 8px`,
            marginInlineStart: 12 + Math.min(depth, 3) * 16 + 17,
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}>
            {node.seats.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{t('unit_no_people')}</p>
            ) : node.seats.map(seat => (
              <div key={seat.personId} className="ds-row" style={{ padding: '5px 2px' }}>
                <span className="ds-grow" style={{ fontSize: 13, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                  {nameOf(seat.personId)}
                </span>

                {seat.isHead && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, background: 'var(--violet-tint)',
                    color: 'var(--violet)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>{t('unit_head_badge')}</span>
                )}

                <MiniLink onClick={() => onOpenPerson(seat.personId)}>{t('unit_open_person')}</MiniLink>

                {canManageUnits && (
                  <>
                    <MiniLink disabled={busy} onClick={() => toggleHead(node.id, seat.personId, seat.isHead)}>
                      {seat.isHead ? t('unit_unset_head') : t('unit_set_head')}
                    </MiniLink>
                    <MiniLink disabled={busy} danger onClick={() => removePerson(node.id, seat.personId)}>
                      {t('unit_remove_person')}
                    </MiniLink>
                  </>
                )}
              </div>
            ))}

            {canManageUnits && (
              adding === node.id ? (
                <PersonPicker
                  staff={staff}
                  exclude={node.seats.map(x => x.personId)}
                  t={t}
                  onPick={id => addPerson(node.id, id)}
                  onClose={() => setAdding(null)}
                />
              ) : (
                <button
                  onClick={() => setAdding(node.id)}
                  disabled={busy}
                  style={{
                    marginTop: node.seats.length > 0 ? 6 : 8,
                    padding: '6px 12px', borderRadius: 8,
                    border: '1px dashed var(--border-strong, var(--border))',
                    background: 'transparent', color: 'var(--text-muted)',
                    fontSize: 12.5, cursor: busy ? 'default' : 'pointer',
                  }}
                >+ {t('unit_add_person')}</button>
              )
            )}
          </div>
        )}
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

/** Текстовая кнопка в строке человека: действий много, крупные кнопки шумят. */
function MiniLink({ onClick, children, disabled, danger }: {
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0, background: 'none', padding: '2px 4px',
        color: danger ? 'var(--danger)' : 'var(--text-muted)',
        fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer', textDecoration: 'underline',
      }}
    >{children}</button>
  )
}

/**
 * Выбор человека для посадки. Уже посаженные в эту единицу не предлагаются:
 * иначе «добавил» выглядело бы как ничего не сделавшее действие.
 */
function PersonPicker({ staff, exclude, t, onPick, onClose }: {
  staff: StaffSummary[]
  exclude: string[]
  t: T
  onPick: (personId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = staff
    .filter(s => !exclude.includes(s.personId))
    .filter(s => !query
      || s.name.toLowerCase().includes(query)
      || (s.positionTitle ?? '').toLowerCase().includes(query))

  return (
    <div style={{ marginTop: 8 }}>
      <div className="ds-row">
        <input
          autoFocus
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('unit_search_person')}
          aria-label={t('unit_search_person')}
          className="ds-grow"
          style={{
            padding: '7px 11px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5,
          }}
        />
        <MiniLink onClick={onClose}>×</MiniLink>
      </div>

      <div style={{ maxHeight: 190, overflowY: 'auto', marginTop: 6 }}>
        {list.length === 0 ? (
          <p style={{ margin: 0, padding: '8px 2px', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {staff.length > exclude.length ? t('no_results') : t('unit_all_seated')}
          </p>
        ) : list.map(s => (
          <button
            key={s.personId}
            onClick={() => onPick(s.personId)}
            style={{
              display: 'block', width: '100%', textAlign: 'start',
              padding: '7px 10px', marginBottom: 2, borderRadius: 8,
              border: '1px solid transparent', background: 'var(--surface)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
            {s.positionTitle && (
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>{s.positionTitle}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
