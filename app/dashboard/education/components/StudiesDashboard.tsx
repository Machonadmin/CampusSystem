'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Дашборд области «Учёба» — приборная панель, которую секретарь колледжа видит
 * первой, войдя в модуль (макет владельца, вариант «ב»): живые числа + расписание
 * на сегодня + кто ждёт распределения на трек. Всё считается из уже существующих
 * эндпойнтов, без нового агрегирующего роута. Deploy-safe: любые сбои → пусто/0.
 */

interface Slot {
  id: string
  day_of_week: number // 1=Пн … 7=Вс
  start_time: string
  end_time: string | null
  room: string | null
  class_group_name: string | null
  subject: string | null
  teachers: string[]
}
interface PendingStudent {
  journey_id: string
  name: string
  department: { id: string; name: string } | null
}
interface AtRiskStudent {
  journey_id: string
  name: string
  department: { id: string; name: string } | null
  absent_count: number
  late_count: number
}
interface StalledApplicant {
  journey_id: string
  applicant: { full_name: string; hebrew_name: string | null }
}

function hhmm(t: string | null): string {
  if (!t) return '—'
  return t.slice(0, 5)
}
// JS getDay(): 0=Вс..6=Сб → в ISO 1=Пн..7=Вс
function todayIsoDow(): number {
  const d = new Date().getDay()
  return d === 0 ? 7 : d
}

export default function StudiesDashboard() {
  const t = useTranslations('education.study.dashboard')
  const [loading, setLoading] = useState(true)
  const [studentsCount, setStudentsCount] = useState<number | null>(null)
  const [todaySlots, setTodaySlots] = useState<Slot[]>([])
  const [pending, setPending] = useState<PendingStudent[]>([])
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([])
  // null = карточка скрыта (нет права view_applicants / эндпойнт недоступен).
  const [stalled, setStalled] = useState<StalledApplicant[] | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const dow = todayIsoDow()
      const [studentsRes, timetableRes, pendingRes, atRiskRes, stalledRes] = await Promise.allSettled([
        fetch('/api/education/journeys?status=student'),
        fetch('/api/education/timetable'),
        fetch('/api/education/track-assignment'),
        fetch('/api/education/at-risk'),
        fetch('/api/education/stalled-applicants'),
      ])

      // Активные студентки
      if (studentsRes.status === 'fulfilled' && studentsRes.value.ok) {
        const body = await studentsRes.value.json().catch(() => null)
        const list = Array.isArray(body) ? body : (body?.journeys ?? body?.students ?? [])
        if (alive) setStudentsCount(Array.isArray(list) ? list.length : 0)
      } else if (alive) setStudentsCount(0)

      // Занятия на сегодня из расписания
      if (timetableRes.status === 'fulfilled' && timetableRes.value.ok) {
        const body = await timetableRes.value.json().catch(() => null)
        const slots: Slot[] = (body?.slots ?? []).filter((s: Slot) => s.day_of_week === dow)
        slots.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        if (alive) setTodaySlots(slots)
      }

      // Ждут распределения на трек
      if (pendingRes.status === 'fulfilled' && pendingRes.value.ok) {
        const body = await pendingRes.value.json().catch(() => null)
        if (alive) setPending(body?.students ?? [])
      }

      // Студентки в зоне риска (много пропусков). Ошибка/403 → пусто → карточка скрыта.
      if (atRiskRes.status === 'fulfilled' && atRiskRes.value.ok) {
        const body = await atRiskRes.value.json().catch(() => null)
        if (alive) setAtRisk(body?.students ?? [])
      }

      // Зависшие абитуриентки. 403 (нет view_applicants) или ошибка → null → карточка скрыта.
      if (stalledRes.status === 'fulfilled' && stalledRes.value.ok) {
        const body = await stalledRes.value.json().catch(() => null)
        const list = body?.applicants
        if (alive) setStalled(Array.isArray(list) ? list : null)
      }

      if (alive) setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 15,
  }
  const cardHead: React.CSSProperties = {
    margin: '0 0 11px', fontSize: 13, fontWeight: 700, color: 'var(--text)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }
  const moreLink: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none' }
  const countBadge: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, lineHeight: 1, padding: '3px 7px', borderRadius: 999,
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 11 }}>
        <Kpi value={loading ? '…' : String(studentsCount ?? 0)} label={t('kpi_students')} tone="accent" />
        <Kpi value={loading ? '…' : String(todaySlots.length)} label={t('kpi_lessons_today')} tone="info" />
        <Kpi value={loading ? '…' : String(pending.length)} label={t('kpi_pending')} tone={pending.length ? 'warn' : 'muted'} />
      </div>

      {/* Требует внимания: студентки в зоне риска + зависшие абитуриентки.
          Каждая карточка независима и скрывается, если данных нет. */}
      {!loading && (atRisk.length > 0 || (stalled && stalled.length > 0)) && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            {t('attention_title')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 13 }} className="dash-grid">
            {atRisk.length > 0 && (
              <div style={card}>
                <h5 style={cardHead}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t('at_risk')}
                    <span style={{ ...countBadge, background: 'var(--danger-tint, rgba(220,38,38,0.12))', color: 'var(--danger)' }}>{atRisk.length}</span>
                  </span>
                </h5>
                <div>
                  {atRisk.slice(0, 5).map(s => (
                    <a key={s.journey_id} href={`/dashboard/education/leads/${s.journey_id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--surface-2)', textDecoration: 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--danger-tint, rgba(220,38,38,0.12))', color: 'var(--danger)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {(s.name || '?').split(' ').slice(0, 2).map(w => w[0] ?? '').join('')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--danger)' }}>
                          {t('at_risk_absences').replace('{n}', String(s.absent_count))}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {stalled && stalled.length > 0 && (
              <div style={card}>
                <h5 style={cardHead}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t('stalled')}
                    <span style={{ ...countBadge, background: 'var(--warn-tint, rgba(217,119,6,0.12))', color: 'var(--warn)' }}>{stalled.length}</span>
                  </span>
                </h5>
                <div>
                  {stalled.slice(0, 5).map(a => {
                    const name = a.applicant?.hebrew_name || a.applicant?.full_name || '—'
                    return (
                      <a key={a.journey_id} href={`/dashboard/education/leads/${a.journey_id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--surface-2)', textDecoration: 'none' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--warn-tint, rgba(217,119,6,0.12))', color: 'var(--warn)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 13 }} className="dash-grid">
        {/* Сегодняшнее расписание */}
        <div style={card}>
          <h5 style={cardHead}>
            {t('today_schedule')}
            <a href="/dashboard/education/timetable" style={moreLink}>{t('view_all')}</a>
          </h5>
          {loading ? (
            <Empty text={t('loading')} />
          ) : todaySlots.length === 0 ? (
            <Empty text={t('today_none')} />
          ) : (
            <div>
              {todaySlots.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', width: 44, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {hhmm(s.start_time)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {s.subject || '—'}{s.class_group_name ? ` · ${s.class_group_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                      {[s.teachers?.join(', '), s.room].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ждут распределения */}
        <div style={card}>
          <h5 style={cardHead}>
            {t('pending_title')}
            <a href="/dashboard/education/track-assignment" style={moreLink}>{t('view_all')}</a>
          </h5>
          {loading ? (
            <Empty text={t('loading')} />
          ) : pending.length === 0 ? (
            <Empty text={t('pending_none')} />
          ) : (
            <div>
              {pending.slice(0, 5).map(p => (
                <div key={p.journey_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--surface-2)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--violet-tint)', color: 'var(--violet)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {p.name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                    {p.department && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.department.name}</div>}
                  </div>
                </div>
              ))}
              {pending.length > 5 && (
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', paddingTop: 8 }}>
                  {t('pending_more').replace('{n}', String(pending.length - 5))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 640px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function Kpi({ value, label, tone }: { value: string; label: string; tone: 'accent' | 'info' | 'warn' | 'muted' }) {
  const color = tone === 'accent' ? 'var(--accent-strong)' : tone === 'info' ? 'var(--info)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 750, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>{text}</div>
}

