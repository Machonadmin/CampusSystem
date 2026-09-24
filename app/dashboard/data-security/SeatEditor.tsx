'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import type { UnitNode } from '@/lib/data-security/units'
import { flattenUnits } from '@/lib/data-security/units'
import type { PersonAccess } from '@/lib/data-security/load'
import type { T } from './shared'

// ─── Куда посажен человек ────────────────────────────────────────────────────
//
// Это и есть граница его доступа, поэтому окно показывает не только галочки, но
// и ЧТО ИМЕННО они откроют: отмеченные единицы плюс всё, что под ними. Без
// такого предпросмотра «дал доступ к колледжу» слишком легко оказывается «дал
// доступ ко всему институту» — разница видна только на дереве, а не в галочке.

export default function SeatEditor({ person, units, t, onClose, onSaved }: {
  person: PersonAccess
  units: UnitNode[]
  t: T
  onClose: () => void
  onSaved: (next: PersonAccess) => void
}) {
  const flat = flattenUnits(units)
  // Начинаем с ПРЯМЫХ посадок и их признака главы. person.departments сюда не
  // годится: там область, уже расширенная на под-единицы, — окно отметило бы
  // их все, и сохранение без правок посадило бы человека в каждую отдельно,
  // а «ראש היחידה» (которого там нет) снялся бы.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(person.seats.map(s => s.departmentId)),
  )
  const [heads, setHeads] = useState<Set<string>>(
    () => new Set(person.seats.filter(s => s.isHead).map(s => s.departmentId)),
  )
  const [reach, setReach] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Предпросмотр считается на сервере тем же expandDepartmentTree, что и
  // реальная проверка доступа, — чтобы окно не обещало одно, а система делала
  // другое.
  useEffect(() => {
    const ids = [...selected]
    if (ids.length === 0) { setReach([]); return }
    let alive = true
    fetch('/api/data-security/units', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_ids: ids }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setReach(d.names ?? []) })
      .catch(() => { if (alive) setReach([]) })
    return () => { alive = false }
  }, [selected])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); setHeads(h => { const n = new Set(h); n.delete(id); return n }) }
      else next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/data-security/person/${person.personId}/seat`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          units: [...selected].map(id => ({ department_id: id, is_head: heads.has(id) })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { toastError(body?.error || t('save_error')); return }
      onSaved(body as PersonAccess)
      toastSuccess(t('saved'))
      onClose()
    } catch {
      toastError(t('save_error'))
    } finally { setSaving(false) }
  }

  return (
    // Третий случай той же забывчивости, найденный стражем
    // lib/data-security/modal-usage.test.ts: Modal своего padding не задаёт,
    // и без него подписи полей упираются в край панели.
    <Modal
      onClose={onClose}
      maxWidth={560}
      ariaLabel={t('seat_edit')}
      panelStyle={{ padding: 20 }}
    >
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{t('seat_edit')}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)' }}>{person.name}</p>

      <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, padding: 6 }}>
        {flat.map(u => {
          const on = selected.has(u.id)
          return (
            <div key={u.id} className="ds-row" style={{ padding: '5px 8px', paddingInlineStart: 8 + Math.min(u.depth, 3) * 16 }}>
              <label className="ds-grow" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(u.id)} />
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: on ? 600 : 400 }}>{u.label}</span>
              </label>
              {on && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={heads.has(u.id)}
                    onChange={() => setHeads(h => {
                      const n = new Set(h)
                      if (n.has(u.id)) n.delete(u.id); else n.add(u.id)
                      return n
                    })}
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('seat_is_head')}</span>
                </label>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 9, background: 'var(--violet-tint)' }}>
        <p style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 700, color: 'var(--violet)' }}>{t('seat_reach')}</p>
        <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--text-muted)' }}>{t('seat_reach_hint')}</p>
        {reach.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{t('seat_none_hint')}</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {reach.map(n => (
              <span key={n} style={{ padding: '4px 10px', borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>{n}</span>
            ))}
          </div>
        )}
      </div>

      <p style={{ margin: '12px 0', padding: '9px 11px', borderRadius: 8, background: 'var(--danger-tint)', fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>
        {t('seat_warning')}
      </p>

      <SubmitButton
        loading={saving}
        onClick={save}
        style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 0, background: getModuleColor('data_security'), color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >{t('seat_save')}</SubmitButton>
    </Modal>
  )
}
