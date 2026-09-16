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
