'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { collidesWithKodesh } from '@/lib/education/kodesh-schedule'
// Форма слота и каркас модалок — общие с кампусной сеткой расписания.
import SlotFormModal, {
  ModalShell, ModalHeader, ModalError,
  weekdayLabel, hhmm, KODESH_GOLD, KODESH_TINT,
} from '@/components/education/SlotFormModal'

// ── Типы ──────────────────────────────────────────────────────────────────────

interface SlotItem {
  id: string
  class_group_id: string
  day_of_week: number        // ISO: 1=Пн .. 7=Вс
  start_time: string         // 'HH:MM:SS'
  end_time: string           // 'HH:MM:SS'
  room: string | null
  // Собственные предмет/преподаватель слота. ОБЯЗАТЕЛЬНО держать здесь: форма
  // редактирования открывается этим объектом, и без них она открылась бы
  // пустой, а сохранение стёрло бы уже заданные значения.
  subject_id?: string | null
  teacher_id?: string | null
  approval_status?: 'active' | 'pending' | 'rejected'
}

interface Props {
  groupId: string
  canManageLessons: boolean
  accentColor: string
  periodStart: string | null
  periodEnd: string | null
}

// ── Хелперы ───────────────────────────────────────────────────────────────────


/** Подстановка {placeholder} — как в остальных i18n-строках проекта. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl)
}

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
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginInlineStart: 6, fontSize: 13 }}>
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
                      const pending = s.approval_status === 'pending'
                      const rejected = s.approval_status === 'rejected'
                      const edge = pending ? KODESH_GOLD : rejected ? 'var(--border-strong)' : (inK ? KODESH_GOLD : accentColor)
                      return (
                        <div key={s.id} style={{
                          background: 'var(--surface)', borderRadius: 10, padding: '9px 11px',
                          border: pending ? `1px dashed ${KODESH_GOLD}` : '1px solid var(--border)',
                          borderInlineStart: `3px solid ${edge}`,
                          boxShadow: 'var(--shadow)', opacity: rejected ? 0.6 : 1,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: inK ? KODESH_GOLD : 'var(--accent-strong)', fontVariantNumeric: 'tabular-nums' }}>
                              {hhmm(s.start_time)}–{hhmm(s.end_time)}
                            </span>
                            {pending ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: KODESH_GOLD, background: KODESH_TINT, padding: '1px 6px', borderRadius: 5 }}>{t('pending_tag')}</span>
                            ) : rejected ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 5 }}>{t('rejected_tag')}</span>
                            ) : inK ? (
                              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', color: KODESH_GOLD, background: KODESH_TINT, padding: '1px 6px', borderRadius: 5 }}>{t('kodesh_tag')}</span>
                            ) : null}
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
          lockGroup
          slot={'create' in formSlot ? null : formSlot}
          presetDay={'create' in formSlot ? formSlot.day : undefined}
          accentColor={accentColor}
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
          <input aria-label={t('from_label')} type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('to_label')}</label>
          <input aria-label={t('to_label')} type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
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
