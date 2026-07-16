'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'

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

function localeFor(lang: string): string {
  return lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
}

// 2024-01-01 — понедельник; стабильный якорь для локализованных имён дней.
// wd — ISO 1=Пн..7=Вс, Date.UTC(2024,0,wd) даёт нужный день.
function weekdayLabel(lang: string, wd: number, format: 'short' | 'long'): string {
  const d = new Date(Date.UTC(2024, 0, wd))
  return d.toLocaleDateString(localeFor(lang), { weekday: format, timeZone: 'UTC' })
}

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM'. */
function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

/** Подстановка {placeholder} — как в остальных i18n-строках проекта. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl)
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function ScheduleTab({ groupId, canManageLessons, accentColor, periodStart, periodEnd }: Props) {
  const t = useTranslations('education.schedule')
  const { lang } = useLang()

  const [slots, setSlots] = useState<SlotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formSlot, setFormSlot] = useState<SlotItem | 'create' | null>(null)
  const [generating, setGenerating] = useState(false)

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
    if (!confirm(t('delete_confirm'))) return
    try {
      const resp = await fetch(`/api/education/schedule/slots/${slot.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('action_failed'))
        return
      }
      load()
    } catch {
      alert(t('action_failed'))
    }
  }

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    padding: '8px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)',
  }
  const btnSmall: React.CSSProperties = {
    padding: '3px 8px', fontSize: 11, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
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
              onClick={() => setFormSlot('create')}
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

      {/* Тело */}
      {loading ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('loading')}</div>
      ) : error ? (
        <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>{error}</div>
      ) : slots.length === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('empty')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>{t('col_day')}</th>
                <th style={th}>{t('col_time')}</th>
                <th style={th}>{t('col_room')}</th>
                {canManageLessons && <th style={{ ...th, textAlign: 'end' }} aria-hidden />}
              </tr>
            </thead>
            <tbody>
              {slots.map(s => (
                <tr key={s.id}>
                  <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{weekdayLabel(lang, s.day_of_week, 'long')}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{hhmm(s.start_time)}–{hhmm(s.end_time)}</td>
                  <td style={{ ...td, color: s.room ? 'var(--text)' : 'var(--border-strong)' }}>{s.room ?? '—'}</td>
                  {canManageLessons && (
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'end' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button onClick={() => setFormSlot(s)} style={btnSmall}>{t('action_edit')}</button>
                        <button onClick={() => handleDelete(s)} style={{ ...btnSmall, color: '#DC2626', borderColor: '#FCA5A5' }}>{t('action_delete')}</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модал слота */}
      {formSlot !== null && (
        <SlotFormModal
          groupId={groupId}
          slot={formSlot === 'create' ? null : formSlot}
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
  accentColor: string
  lang: string
  onClose: () => void
  onDone: () => void
}

function SlotFormModal({ groupId, slot, accentColor, lang, onClose, onDone }: SlotFormModalProps) {
  const t = useTranslations('education.schedule')

  const [dayOfWeek, setDayOfWeek] = useState(slot ? String(slot.day_of_week) : '1')
  const [startTime, setStartTime] = useState(slot ? hhmm(slot.start_time) : '')
  const [endTime, setEndTime] = useState(slot ? hhmm(slot.end_time) : '')
  const [room, setRoom] = useState(slot?.room ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
      }
      const resp = slot
        ? await fetch(`/api/education/schedule/slots/${slot.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/education/class-groups/${groupId}/schedule/slots`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setFormError(err.error ?? t('action_failed'))
        return
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
        <div>
          <label style={labelStyle}>{t('room_label')}</label>
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
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#ECFDF5', color: '#065F46', borderRadius: 8, fontSize: 13 }}>
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
        <button
          onClick={handleRun} disabled={running}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
            background: accentColor, border: 'none', borderRadius: 8,
            cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.55 : 1,
          }}
        >
          {running ? t('generating') : t('generate_run')}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Общие части модалок ───────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

function ModalError({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
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
      <button
        onClick={onSubmit} disabled={saving}
        style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accentColor, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.55 : 1 }}
      >
        {saveLabel}
      </button>
    </div>
  )
}
