'use client'

import type { PrivilegeLevel, PrivilegeRisk } from '@/types/database'

// Мелкие части экрана «Безопасность данных», общие для обоих видов.
//
// Правило, которое здесь соблюдается везде: технический код (studies.set_grades)
// подписью НЕ БЫВАЕТ. Если подписи нет, показывается честное «нет подписи» —
// потому что код всё равно ничего не объясняет тому, кто выдаёт доступ.

export type T = (key: string, fallback?: string) => string

/** Цвета ступени доступа. Шкала читается по цвету, а не по чтению текста. */
const LEVEL_STYLE: Record<PrivilegeLevel, { bg: string; fg: string }> = {
  access: { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  view:   { bg: 'var(--info-tint)', fg: 'var(--accent-strong)' },
  edit:   { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  manage: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '3px 10px', borderRadius: 7,
  fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
}

export function LevelBadge({ level, t }: { level: PrivilegeLevel | null; t: T }) {
  if (!level) return null
  const s = LEVEL_STYLE[level]
  return <span style={{ ...chip, background: s.bg, color: s.fg }}>{t(`level_${level}`)}</span>
}

export function RiskBadge({ risk, t }: { risk: PrivilegeRisk; t: T }) {
  if (risk === 'normal') return null
  const critical = risk === 'critical'
  return (
    <span style={{
      ...chip,
      background: critical ? 'var(--danger-tint)' : 'var(--warn-tint)',
      color: critical ? 'var(--danger)' : 'var(--warn)',
    }}>
      {t(critical ? 'risk_critical' : 'risk_sensitive')}
    </span>
  )
}

/**
 * Область действия. Отдельный цвет от ступени: это другой вопрос («на какие
 * записи»), и смешивать их на одном экране нельзя — именно из-за этого раньше
 * было непонятно, почему у двух людей «одно и то же право» работает по-разному.
 */
export function ScopeBadge({ scope, departments, t }: {
  scope: string | null
  /** Подписи подразделений человека — из них получается «только кодеш». */
  departments?: string[]
  t: T
}) {
  if (!scope) return null
  const label = scope === 'department' && departments?.length
    ? departments.join(' · ')
    : t(`scope_${scope}`)
  return (
    <span style={{ ...chip, background: 'var(--violet-tint)', color: 'var(--violet)' }}>
      {label}
    </span>
  )
}

export function SourceBadge({ source, expiresAt, expired, t, lang }: {
  source: string
  expiresAt: string | null
  expired: boolean
  t: T
  lang: string
}) {
  const tone =
    source === 'personal_grant' ? { bg: 'var(--success-tint)', fg: 'var(--success)' }
    : source.startsWith('personal_deny') ? { bg: 'var(--danger-tint)', fg: 'var(--danger)' }
    : { bg: 'var(--surface-2)', fg: 'var(--text-muted)' }

  const date = expiresAt
    ? new Date(expiresAt).toLocaleDateString(lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-GB' : 'ru-RU')
    : null

  return (
    <span style={{ ...chip, background: tone.bg, color: tone.fg }}>
      {t(`source_${source}`)}
      {expired && ` · ${t('expired')}`}
      {!expired && date && ` · ${t('expires_at').replace('{date}', date)}`}
    </span>
  )
}

/**
 * Подпись права. Никогда не показывает технический код: без перевода пишет
 * «нет подписи» — это честнее и это то, что просил владелец.
 */
export function PrivilegeName({ name, t }: { name: string | null; t: T }) {
  if (name) return <>{name}</>
  return <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>{t('no_name')}</span>
}

/** Пометка «объяснение не написано»: его должен дописать человек, а не система. */
export function MissingDescription({ t }: { t: T }) {
  return (
    <span style={{ ...chip, background: 'var(--warn-tint)', color: 'var(--warn)' }}>
      {t('no_description')}
    </span>
  )
}

export const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
}

/**
 * Плитка раздела. Экран раскрывает ровно ОДИН раздел за раз: владелец сказал,
 * что «всё сразу» читается как каша, и он прав — 141 право на одной странице
 * невозможно окинуть взглядом. Плитка отвечает на единственный вопрос, который
 * нужен перед входом: сколько здесь всего и сколько уже открыто.
 */
export function AreaTile({ name, accent, caption, active, onClick, onDragOver, onDragLeave, onDrop, dropActive }: {
  name: string
  accent: string
  caption: string
  active?: boolean
  onClick: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent) => void
  dropActive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-pressed={active}
      style={{
        display: 'block', width: '100%', textAlign: 'start',
        padding: '12px 14px',
        borderRadius: 11,
        border: `1px solid ${dropActive ? 'var(--accent)' : active ? accent : 'var(--border)'}`,
        borderInlineStartWidth: 4,
        borderInlineStartColor: accent,
        background: dropActive ? 'var(--accent-tint)' : active ? 'var(--surface-2)' : 'var(--surface)',
        cursor: 'pointer',
      }}
    >
      <span style={{
        display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)',
        overflowWrap: 'anywhere',
      }}>{name}</span>
      <span style={{ display: 'block', marginTop: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>
        {caption}
      </span>
    </button>
  )
}

/** Возврат из раздела к списку разделов. Одна и та же кнопка в обоих видах. */
export function BackToAreas({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer',
      }}
    >
      <span aria-hidden>‹</span>{label}
    </button>
  )
}
