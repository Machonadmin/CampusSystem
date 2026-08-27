'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Skeleton'

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

export default function StudiesDashboard({ onOpenStudents }: { onOpenStudents?: () => void } = {}) {
  const t = useTranslations('education.study.dashboard')
  const [loading, setLoading] = useState(true)
  const [studentsCount, setStudentsCount] = useState<number | null>(null)
  const [todaySlots, setTodaySlots] = useState<Slot[]>([])
  const [pending, setPending] = useState<PendingStudent[]>([])
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([])
  // null = карточка скрыта (нет права view_applicants / эндпойнт недоступен).
  const [stalled, setStalled] = useState<StalledApplicant[] | null>(null)

  // Авто-переход учебного года: тихая идемпотентная проверка при заходе.
  // Выполняется максимум раз в год после заданной даты; иначе — мгновенный no-op.
  useEffect(() => {
    fetch('/api/education/year-rollover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto' }),
    }).catch(() => {})
  }, [])

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
      {/* KPI. Owner: пустые нули не показываем — карточка с 0 скрывается,
          КРОМЕ «уроки сегодня» (единственный ноль, который сам по себе информация). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 11 }}>
        {(loading || (studentsCount ?? 0) > 0) && (
          <Kpi value={loading ? '…' : String(studentsCount ?? 0)} label={t('kpi_students')} tone="accent" onClick={onOpenStudents} />
        )}
        <Kpi value={loading ? '…' : String(todaySlots.length)} label={t('kpi_lessons_today')} tone="info" href="/dashboard/education/timetable" />
        {(loading || pending.length > 0) && (
          <Kpi value={loading ? '…' : String(pending.length)} label={t('kpi_pending')} tone="warn" href="/dashboard/education/track-assignment" />
        )}
      </div>

      {/* Пусковая панель вынесена в отдельный раздел «פעולות» (owner: дашборд =
          только данные, чтобы не перегружать глаз). */}

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

      {/* Owner: пустые блоки не показываем — карточка «ждут распределения»
          скрывается при нуле; расписание остаётся всегда (исключение — уроки). */}
      <div style={{ display: 'grid', gridTemplateColumns: !loading && pending.length === 0 ? 'minmax(0, 1fr)' : 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 13 }} className="dash-grid">
        {/* Сегодняшнее расписание */}
        <div style={card}>
          <h5 style={cardHead}>
            {t('today_schedule')}
            <a href="/dashboard/education/timetable" style={moreLink}>{t('view_all')}</a>
          </h5>
          {loading ? (
            <SkeletonRows rows={4} />
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

        {/* Ждут распределения — скрыто целиком, когда нет ожидающих (owner). */}
        {(loading || pending.length > 0) && (
        <div style={card}>
          <h5 style={cardHead}>
            {t('pending_title')}
            <a href="/dashboard/education/track-assignment" style={moreLink}>{t('view_all')}</a>
          </h5>
          {loading ? (
            <SkeletonRows rows={4} />
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
        )}
      </div>

      <style>{`@media (max-width: 640px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function Kpi({ value, label, tone, href, onClick }: {
  value: string; label: string; tone: 'accent' | 'info' | 'warn' | 'muted'
  href?: string; onClick?: () => void
}) {
  const color = tone === 'accent' ? 'var(--accent-strong)' : tone === 'info' ? 'var(--info)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)'
  const clickable = !!(href || onClick)
  const base: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px',
    display: 'block', textDecoration: 'none', textAlign: 'start', width: '100%',
    ...(clickable ? { cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s' } : {}),
  }
  const enter = (el: HTMLElement) => { el.style.borderColor = 'var(--accent)'; el.style.boxShadow = 'var(--shadow)' }
  const leave = (el: HTMLElement) => { el.style.borderColor = 'var(--border)'; el.style.boxShadow = 'none' }
  const inner = (
    <>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 750, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{label}</div>
    </>
  )
  if (href) {
    return (
      <a href={href} style={base}
        onMouseEnter={e => enter(e.currentTarget)} onMouseLeave={e => leave(e.currentTarget)}>{inner}</a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ ...base, font: 'inherit' }}
        onMouseEnter={e => enter(e.currentTarget)} onMouseLeave={e => leave(e.currentTarget)}>{inner}</button>
    )
  }
  return <div style={base}>{inner}</div>
}

function Empty({ text }: { text: string }) {
  return <EmptyState text={text} size="compact" />
}

// ─── Пусковая панель: всё, что можно сделать под «Учёбой», сгруппировано ───────
// Каждая карточка ведёт на отдельный маршрут (href). Подписи через t(key,
// fallback) — падают на иврит, если ключа ещё нет (парити-тест не затрагивается).
// `acc` — ключ в ответе /api/education/launcher-access: карточка скрывается,
// если доступ явно false (клик всё равно упёрся бы в 403). Нет ключа → всегда
// видна (структурные пункты рельса).
type LItem = { key: string; fb: string; icon: string; href: string; acc?: string }

const LIC = {
  cal: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  cap: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  grid: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  map: 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z',
  star: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  users: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  bld: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.75A.75.75 0 019.75 16.5h4.5a.75.75 0 01.75.75V21',
  cog: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
}

// Дедуп (запрос владельца, вторая итерация): «פעולות» = ТОЛЬКО ежедневные
// действия, одной плоской сеткой без под-заголовков. Убраны дубли и настройки:
//   • «סמסטרים» — есть в рельсе слева (и вёл на ЛЕГАСИ-страницу старой таблицы);
//   • «מקצועות» — есть в «הגדרות» (тот же экран);
//   • «מבנה יחידות», «יחידות לימוד» — конфигурация → перенесены в «הגדרות».
// Ничего не удалено из системы — только из этой панели.
const LGROUPS: { key: string; fb: string; badge?: string; items: LItem[] }[] = [
  { key: 'launch_actions_flat', fb: '', items: [
    { key: 'launch_assignment', fb: 'שיבוץ', icon: LIC.grid, href: '/dashboard/education/assignment', acc: 'assignment' },
    // «שיבוץ מסלולים» убран (owner: «ממה נפשך» — дубль): вход на распределение
    // по маршрутам живёт на дашборде (KPI + карточка «ждут распределения»),
    // который появляется ровно тогда, когда есть кого распределять.
    { key: 'launch_kodesh', fb: 'שיבוץ קודש', icon: LIC.star, href: '/dashboard/education/kodesh', acc: 'kodesh' },
    { key: 'launch_teachers_hours', fb: 'מורים ושעות', icon: LIC.users, href: '/dashboard/education/teachers-hours', acc: 'teachers_hours' },
    { key: 'launch_teacher_attendance', fb: 'נוכחות מורים', icon: LIC.check, href: '/dashboard/education/teacher-attendance', acc: 'teacher_attendance' },
    { key: 'launch_absences', fb: 'טיפול בהעדרויות', icon: LIC.alert, href: '/dashboard/education/absences', acc: 'absences' },
    { key: 'launch_teaching_surveys', fb: 'הערכת הוראה', icon: LIC.chart, href: '/dashboard/education/teaching-surveys', acc: 'teaching_surveys' },
    // «חברותא» убрана (owner: дубль): модуль «חברותא» есть в главном боковом
    // меню и ведёт менеджера на тот же хаб.
    { key: 'launch_reports', fb: 'דוחות', icon: LIC.chart, href: '/dashboard/education/reports', acc: 'reports' },
  ] },
]

export function Launcher({ t, access }: { t: ReturnType<typeof useTranslations>; access: Record<string, boolean> | null }) {
  // Пока доступ не загружен — показываем скелет, НЕ все карточки. Иначе виден
  // «вспышка всего» и последующее схлопывание до разрешённого — это выглядит как
  // утечка прав (владелец: «יש לי גישה לרגע אחד להכל ואז זה מתכווץ»).
  if (access == null) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))', gap: 10 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ height: 58, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: 0.6 }} />
        ))}
      </div>
    )
  }
  // Карточка видна только при явно НЕ‑false доступе (fail‑closed).
  const visible = (it: LItem) => !it.acc || access[it.acc] !== false
  const groups = LGROUPS
    .map(g => ({ ...g, items: g.items.filter(visible) }))
    .filter(g => g.items.length > 0)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {groups.map(g => (
        <div key={g.key}>
          {/* Под-заголовок группы — только если задан (плоская сетка без него). */}
          {g.fb && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 9px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{t(g.key, g.fb)}</span>
              {g.badge && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-tint)', padding: '2px 8px', borderRadius: 999 }}>{t(g.key + '_badge', g.badge)}</span>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))', gap: 10 }}>
            {g.items.map(it => <LaunchCard key={it.key} it={it} label={t(it.key, it.fb)} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function LaunchCard({ it, label }: { it: LItem; label: string }) {
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', width: '100%',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
    textAlign: 'start', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
  }
  return (
    <a className="home-card" href={it.href} style={style}>
      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}>
        <svg style={{ width: 19, height: 19 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={it.icon} /></svg>
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
    </a>
  )
}

