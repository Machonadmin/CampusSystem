'use client'

import { useCallback, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { collidesWithKodesh } from '@/lib/education/kodesh-schedule'

// ── Типы ──────────────────────────────────────────────────────────────────────

interface SlotItem {
  id: string
  class_group_id: string
  day_of_week: number        // ISO: 1=Пн .. 7=Вс
  start_time: string         // 'HH:MM:SS'
  end_time: string           // 'HH:MM:SS'
  room: string | null
}

interface Props {
  groupId: string
  canManageLessons: boolean
  accentColor: string
  periodStart: string | null
  periodEnd: string | null
}

// ── Хелперы ───────────────────────────────────────────────────────────────────


// 2024-01-01 — понедельник; стабильный якорь для локализованных имён дней.
// wd — ISO 1=Пн..7=Вс, Date.UTC(2024,0,wd) даёт нужный день.
function weekdayLabel(lang: string, wd: number, format: 'short' | 'long'): string {
  const d = new Date(Date.UTC(2024, 0, wd))
  return d.toLocaleDateString(intlLocale(lang), { weekday: format, timeZone: 'UTC' })
}

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM'. */
function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

/** Подстановка {placeholder} — как в остальных i18n-строках проекта. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl)
}

// Кодеш-акцент (золото модуля «еврейство») — для слотов, попадающих в
// зарезервированное утреннее окно. Тинт через rgba работает в обеих темах.
const KODESH_GOLD = '#ca8a04'
const KODESH_TINT = 'rgba(202,138,4,0.13)'

const cardBtn: React.CSSProperties = {
  padding: '3px 8px', fontSize: 11, color: 'var(--text)',
  background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function ScheduleTab({ groupId, canManageLessons, accentColor, periodStart, periodEnd }: Props) {
  const t = useTranslations('education.schedule')
  const { lang } = useLang()

  const [slots, setSlots] = useState<SlotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formSlot, setFormSlot] = useState<SlotItem | { create: true; day: number } | null>(null)
  const [generating, setGenerating] = useState(false)

  // Израильская учебная неделя: Вс–Чт всегда показываем; Пт/Сб — только если
  // в них есть слоты. Порядок колонок — Вс..Сб.
  const WEEK_ORDER = [7, 1, 2, 3, 4, 5, 6]
  const BASE_DAYS = [7, 1, 2, 3, 4]
  const cols = WEEK_ORDER.filter(d => BASE_DAYS.includes(d) || slots.some(s => s.day_of_week === d))
  const byDay = new Map<number, SlotItem[]>()
  for (const s of slots) { const a = byDay.get(s.day_of_week) ?? []; a.push(s); byDay.set(s.day_of_week, a) }
  for (const a of byDay.values()) a.sort((x, y) => x.start_time.localeCompare(y.start_time))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/schedule/slots`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('load_error'))
      }
      const data = await resp.json()
      setSlots(data.slots ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [groupId, t])

  useEffect(() => { load() }, [load])

  const handleDelete = async (slot: SlotItem) => {
    if (!(await confirmDialog({ message: t('delete_confirm'), tone: 'danger' }))) return
    try {
      const resp = await fetch(`/api/education/schedule/slots/${slot.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('action_failed'), 'error')
        return
      }
      load()
    } catch {
      toast(t('action_failed'), 'error')
    }
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 20 }}>
      {/* Заголовок + действия */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {t('section_title')}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 13 }}>
            ({slots.length})
          </span>
        </h2>
        {canManageLessons && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setFormSlot({ create: true, day: cols[0] ?? 7 })}
              style={{ padding: '4px 10px', fontSize: 12, color: accentColor, background: 'var(--surface)', border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer' }}
            >
              {t('add_slot')}
            </button>
            <button
              onClick={() => setGenerating(true)}
              style={{ padding: '4px 10px', fontSize: 12, color: '#fff', background: accentColor, border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer' }}
            >
              {t('generate')}
            </button>
          </div>
        )}
      </div>

      {/* Тело — недельная сетка по дням (Вс..Чт + дни со слотами) */}
      {loading ? (
        <SkeletonRows avatar={false} />
      ) : error ? (
        <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{error}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(148px, 1fr))`, gap: 10, minWidth: cols.length * 158 }}>
            {cols.map(day => {
              const daySlots = byDay.get(day) ?? []
              return (
                <div key={day}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0', marginBottom: 8, borderBottom: '2px solid var(--border)' }}>
                    {weekdayLabel(lang, day, 'long')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                    {daySlots.map(s => {
                      const inK = collidesWithKodesh(s.day_of_week, hhmm(s.start_time), hhmm(s.end_time))
                      return (
                        <div key={s.id} style={{
                          background: 'var(--surface)', borderRadius: 10, padding: '9px 11px',
                          border: '1px solid var(--border)', borderInlineStart: `3px solid ${inK ? KODESH_GOLD : accentColor}`,
                          boxShadow: 'var(--shadow)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: inK ? KODESH_GOLD : 'var(--accent-strong)', fontVariantNumeric: 'tabular-nums' }}>
                              {hhmm(s.start_time)}–{hhmm(s.end_time)}
                            </span>
                            {inK && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', color: KODESH_GOLD, background: KODESH_TINT, padding: '1px 6px', borderRadius: 5 }}>{t('kodesh_tag')}</span>}
                          </div>
                          {s.room && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{s.room}</div>}
                          {canManageLessons && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                              <button onClick={() => setFormSlot(s)} style={cardBtn}>{t('action_edit')}</button>
                              <button onClick={() => handleDelete(s)} style={{ ...cardBtn, color: 'var(--danger)', borderColor: 'var(--danger)' }}>{t('action_delete')}</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {canManageLessons ? (
                      <button
                        onClick={() => setFormSlot({ create: true, day })}
                        style={{
                          border: '1px dashed var(--border-strong)', borderRadius: 10, padding: '9px 8px',
                          background: 'transparent', color: 'var(--text-faint)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = accentColor; el.style.color = accentColor }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border-strong)'; el.style.color = 'var(--text-faint)' }}
                      >
                        <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> {t('add_slot_day')}
                      </button>
                    ) : daySlots.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '10px 0' }}>—</div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Модал слота */}
      {formSlot !== null && (
        <SlotFormModal
          groupId={groupId}
          slot={'create' in formSlot ? null : formSlot}
          presetDay={'create' in formSlot ? formSlot.day : undefined}
          accentColor={accentColor}
          lang={lang}
          onClose={() => setFormSlot(null)}
          onDone={() => { setFormSlot(null); load() }}
        />
      )}

      {/* Модал генерации */}
      {generating && (
        <GenerateModal
          groupId={groupId}
          accentColor={accentColor}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  )
}

// ── Модал создания/редактирования слота ──────────────────────────────────────

interface SlotFormModalProps {
  groupId: string
  slot: SlotItem | null   // null = создание
  presetDay?: number      // предвыбранный день недели при создании (клик по колонке)
  accentColor: string
  lang: string
  onClose: () => void
  onDone: () => void
}

function SlotFormModal({ groupId, slot, presetDay, accentColor, lang, onClose, onDone }: SlotFormModalProps) {
  const t = useTranslations('education.schedule')

  const [dayOfWeek, setDayOfWeek] = useState(slot ? String(slot.day_of_week) : String(presetDay ?? 1))
  const [startTime, setStartTime] = useState(slot ? hhmm(slot.start_time) : '')
  const [endTime, setEndTime] = useState(slot ? hhmm(slot.end_time) : '')
  const [room, setRoom] = useState(slot?.room ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Здания/аудитории — если заданы, можно выбрать; иначе — свободный текст.
  const [buildings, setBuildings] = useState<{ id: string; name: string; rooms: { id: string; name: string }[] }[]>([])
  const [buildingId, setBuildingId] = useState('')
  const [roomId, setRoomId] = useState('')
  useEffect(() => {
    fetch('/api/education/buildings')
      .then(r => (r.ok ? r.json() : { buildings: [] }))
      .then(b => setBuildings(b.buildings ?? []))
      .catch(() => setBuildings([]))
  }, [])
  const pickedBuilding = buildings.find(b => b.id === buildingId)

  const handleSubmit = async () => {
    if (!startTime || !endTime) {
      setFormError(t('time_required'))
      return
    }
    if (endTime <= startTime) {
      setFormError(t('end_after_start'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        room: room.trim() || null,
        building_id: buildingId || null,
        room_id: roomId || null,
      }
      const resp = slot
        ? await fetch(`/api/education/schedule/slots/${slot.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/education/class-groups/${groupId}/schedule/slots`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const respBody = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setFormError(respBody.error ?? t('action_failed'))
        return
      }
      // Мягкое правило иудаики: слот сохранён, но время зарезервировано — предупреждаем.
      if (respBody.warning) toast(respBody.warning, 'info')
      // Перенос кабинета → уведомлены преподаватели/ученицы группы.
      if (respBody.room_move_notified) toast(t('room_moved_notified').replace('{n}', String(respBody.room_move_notified)), 'info')
      // Конфликты кабинет/преподаватель/ученицы — не блокируют, но предупреждаем.
      const conflicts = (respBody.conflicts ?? []) as Array<{ kind: 'room' | 'teacher' | 'students'; group_name: string; detail?: string }>
      for (const c of conflicts) {
        const msg = c.kind === 'room'
          ? t('conflict_room').replace('{room}', c.detail ?? '').replace('{group}', c.group_name)
          : c.kind === 'teacher'
            ? t('conflict_teacher').replace('{group}', c.group_name)
            : t('conflict_students').replace('{n}', c.detail ?? '').replace('{group}', c.group_name)
        toast(msg, 'error')
      }
      onDone()
    } catch {
      setFormError(t('action_failed'))
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={slot ? t('modal_edit_title') : t('modal_create_title')} onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>{t('day_label')}</label>
          <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} style={inputStyle}>
            {[1, 2, 3, 4, 5, 6, 7].map(wd => (
              <option key={wd} value={wd}>{weekdayLabel(lang, wd, 'long')}</option>
            ))}
          </select>
        </div>
        <div className="resp-grid-2" style={{ gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('start_label')} *</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('end_label')} *</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {buildings.length > 0 && (
          <div className="resp-grid-2" style={{ gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('building_label')}</label>
              <select
                value={buildingId}
                onChange={e => { setBuildingId(e.target.value); setRoomId('') }}
                style={inputStyle}
              >
                <option value="">{t('none_option')}</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('room_select_label')}</label>
              <select
                value={roomId}
                onChange={e => {
                  const rid = e.target.value
                  setRoomId(rid)
                  const rm = pickedBuilding?.rooms.find(r => r.id === rid)
                  if (rm && pickedBuilding) setRoom(`${pickedBuilding.name} / ${rm.name}`)
                }}
                disabled={!pickedBuilding || pickedBuilding.rooms.length === 0}
                style={inputStyle}
              >
                <option value="">{t('none_option')}</option>
                {(pickedBuilding?.rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label style={labelStyle}>{t('room_label')} {buildings.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>· {t('or_free_text')}</span>}</label>
          <input value={room} onChange={e => setRoom(e.target.value)} placeholder={t('room_placeholder')} style={inputStyle} />
        </div>
      </div>

      {formError && <ModalError text={formError} />}

      <ModalActions
        accentColor={accentColor}
        saving={saving}
        onCancel={onClose}
        onSubmit={handleSubmit}
        cancelLabel={t('btn_cancel')}
        saveLabel={saving ? t('btn_saving') : t('btn_save')}
      />
    </ModalShell>
  )
}

// ── Модал генерации уроков ────────────────────────────────────────────────────

interface GenerateModalProps {
  groupId: string
  accentColor: string
  periodStart: string | null
  periodEnd: string | null
  onClose: () => void
}

function GenerateModal({ groupId, accentColor, periodStart, periodEnd, onClose }: GenerateModalProps) {
  const t = useTranslations('education.schedule')

  const [from, setFrom] = useState(periodStart ?? '')
  const [to, setTo] = useState(periodEnd ?? '')
  const [running, setRunning] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const handleRun = async () => {
    setRunning(true)
    setFormError(null)
    setResult(null)
    try {
      const payload: { from?: string; to?: string } = {}
      if (from.trim()) payload.from = from.trim()
      if (to.trim()) payload.to = to.trim()
      const resp = await fetch(`/api/education/class-groups/${groupId}/schedule/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setFormError(data.error ?? t('action_failed'))
        return
      }
      setResult({ created: data.created ?? 0, skipped: data.skipped ?? 0 })
    } catch {
      setFormError(t('action_failed'))
    } finally {
      setRunning(false)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t('generate_modal_title')} onClose={onClose} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('generate_hint')}</p>
      <div className="resp-grid-2" style={{ gap: 12 }}>
        <div>
          <label style={labelStyle}>{t('from_label')}</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('to_label')}</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {formError && <ModalError text={formError} />}
      {result && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--success-tint)', color: 'var(--success)', borderRadius: 8, fontSize: 13 }}>
          {fill(t('generate_result'), { created: result.created, skipped: result.skipped })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
        <button
          onClick={onClose} disabled={running}
          style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
        >
          {result ? t('close') : t('btn_cancel')}
        </button>
        <SubmitButton
          onClick={handleRun} loading={running}
          loadingLabel={t('generating')}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
            background: accentColor, border: 'none', borderRadius: 8,
            cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.55 : 1,
          }}
        >
          {t('generate_run')}
        </SubmitButton>
      </div>
    </ModalShell>
  )
}

// ── Общие части модалок ───────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose} maxWidth={440} closeOnBackdrop panelStyle={{ padding: 24 }}>
      {children}
    </Modal>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const tCommon = useTranslations('common')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
      <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

function ModalError({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
      {text}
    </div>
  )
}

function ModalActions({
  accentColor, saving, onCancel, onSubmit, cancelLabel, saveLabel,
}: { accentColor: string; saving: boolean; onCancel: () => void; onSubmit: () => void; cancelLabel: string; saveLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
      <button
        onClick={onCancel} disabled={saving}
        style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
      >
        {cancelLabel}
      </button>
      <SubmitButton
        onClick={onSubmit} loading={saving}
        style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accentColor, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.55 : 1 }}
      >
        {saveLabel}
      </SubmitButton>
    </div>
  )
}
