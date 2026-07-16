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

  useEffect(() => {
    let alive = true
    async function load() {
      const dow = todayIsoDow()
      const [studentsRes, timetableRes, pendingRes] = await Promise.allSettled([
        fetch('/api/education/journeys?status=student'),
        fetch('/api/education/timetable'),
        fetch('/api/education/track-assignment'),
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

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 11 }}>
        <Kpi value={loading ? '…' : String(studentsCount ?? 0)} label={t('kpi_students')} tone="accent" />
        <Kpi value={loading ? '…' : String(todaySlots.length)} label={t('kpi_lessons_today')} tone="info" />
        <Kpi value={loading ? '…' : String(pending.length)} label={t('kpi_pending')} tone={pending.length ? 'warn' : 'muted'} />
      </div>

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

      {/* Быстрые переходы */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <QuickLink href="/dashboard/education/timetable" icon="🗓️" label={t('open_timetable')} />
        <QuickLink href="/dashboard/education/my-day" icon="📅" label={t('open_myday')} />
        <QuickLink href="/dashboard/education/track-assignment" icon="🧩" label={t('open_assign')} />
        <QuickLink href="/dashboard/education/reports" icon="📊" label={t('open_reports')} />
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

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
        color: 'var(--text-muted)', textDecoration: 'none', background: 'var(--surface)',
        border: '1px solid var(--border-strong)', borderRadius: 9, padding: '8px 13px', whiteSpace: 'nowrap',
      }}
    >
      <span>{icon}</span>{label}
    </a>
  )
}
