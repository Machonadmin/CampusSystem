'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { getModuleColor } from '@/lib/module-colors'
import type { BuiltTree, TreeNode, CatalogEntry } from '@/lib/data-security/tree'
import { privilegeKey } from '@/lib/data-security/tree'
import type { ResolvedPrivilege } from '@/lib/data-security/person'
import type { StaffSummary, PersonAccess } from '@/lib/data-security/load'
import {
  LevelBadge, RiskBadge, ScopeBadge, SourceBadge, PrivilegeName,
  cardStyle, type T,
} from './shared'

// ─── Вид «по сотруднику»: здесь утверждают доступ ────────────────────────────
//
// Экран показывает не «галочки», а ответ на вопрос «что этому человеку реально
// открыто и откуда это взялось». Источник обязателен: без него администратор
// видит включённый переключатель и не понимает, исчезнет ли доступ при смене
// должности.
//
// Меняются ТОЛЬКО личные решения (person_privileges). Права должности отсюда не
// правятся намеренно: это задело бы всех её держателей разом, а экран — про
// одного человека.

type Decision = 'inherit' | 'grant' | 'deny'

export default function PersonView({ tree, staff, canGrant, t, lang }: {
  tree: BuiltTree
  staff: StaffSummary[]
  canGrant: boolean
  t: T
  lang: string
}) {
  const [query, setQuery] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [access, setAccess] = useState<PersonAccess | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Несохранённые решения: ключ права → решение. */
  const [draft, setDraft] = useState<Map<string, Decision>>(new Map())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.positionTitle ?? '').toLowerCase().includes(q) ||
      (s.loginEmail ?? '').toLowerCase().includes(q))
  }, [staff, query])

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setDraft(new Map())
    try {
      const res = await fetch(`/api/data-security/person/${id}`)
      if (!res.ok) { toastError(t('load_error')); setAccess(null); return }
      setAccess(await res.json())
    } catch {
      toastError(t('load_error'))
      setAccess(null)
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { if (personId) load(personId) }, [personId, load])

  const resolved = useMemo(() => {
    const map = new Map<string, ResolvedPrivilege>()
    for (const r of access?.privileges ?? []) map.set(privilegeKey(r.module, r.code), r)
    return map
  }, [access])

  /** Текущее решение по праву: черновик, иначе то, что есть сейчас. */
  const decisionOf = (key: string): Decision => {
    const drafted = draft.get(key)
    if (drafted) return drafted
    const r = resolved.get(key)
    if (!r) return 'inherit'
    if (r.source === 'personal_grant' && !r.expired) return 'grant'
    if (r.source.startsWith('personal_deny') && !r.expired) return 'deny'
    return 'inherit'
  }

  const setDecision = (key: string, value: Decision) => {
    if (!canGrant) return
    setDraft(prev => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }

  const dirty = draft.size > 0

  const save = async () => {
    if (!personId || !canGrant) return
    setSaving(true)
    try {
      // Отправляется ПОЛНЫЙ список личных решений: и уже существующие, и новые.
      // Маршрут заменяет их целиком — как и старый экран личных прав.
      const overrides: { module: string; privilege_code: string; is_granted: boolean }[] = []
      const keys = new Set<string>([...resolved.keys(), ...draft.keys()])
      for (const key of keys) {
        const [module, code] = key.split('::')
        const d = decisionOf(key)
        if (d === 'grant') overrides.push({ module, privilege_code: code, is_granted: true })
        else if (d === 'deny') overrides.push({ module, privilege_code: code, is_granted: false })
      }
      const res = await fetch(`/api/data-security/person/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { toastError(body?.error || t('save_error')); return }
      setAccess(body as PersonAccess)
      setDraft(new Map())
      toastSuccess(t('saved'))
    } catch {
      toastError(t('save_error'))
    } finally { setSaving(false) }
  }

  const deptNames = (access?.departments ?? []).map(d => d.name)

  // ── Строка права ──────────────────────────────────────────────────────────
  const renderItem = (item: CatalogEntry) => {
    const key = privilegeKey(item.module, item.code)
    const r = resolved.get(key)
    const decision = decisionOf(key)
    const changed = draft.has(key)
    const effectiveGranted = decision === 'grant' || (decision === 'inherit' && r?.granted === true)

    return (
      <div key={key} style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 12px', paddingInlineStart: 34,
        borderRadius: 8,
        background: changed ? 'var(--warn-tint)' : 'transparent',
        opacity: item.isLegacy ? 0.6 : 1,
      }}>
        <span style={{
          flexGrow: 1, fontSize: 13, color: 'var(--text)',
          textDecoration: !effectiveGranted && decision === 'deny' ? 'line-through' : undefined,
        }}>
          <PrivilegeName name={item.name} t={t} />
        </span>

        {r && !r.expired && r.source !== 'role' && (
          <SourceBadge source={r.source} expiresAt={r.expiresAt} expired={false} t={t} lang={lang} />
        )}
        {r?.expired && (
          <SourceBadge source={r.source} expiresAt={r.expiresAt} expired t={t} lang={lang} />
        )}
        {r?.granted && r.source === 'role' && !changed && (
          <SourceBadge source="role" expiresAt={null} expired={false} t={t} lang={lang} />
        )}
        {effectiveGranted && r?.scope && <ScopeBadge scope={r.scope} departments={deptNames} t={t} />}
        <RiskBadge risk={item.risk} t={t} />
        <LevelBadge level={item.level} t={t} />

        <ThreeWay
          value={decision}
          disabled={!canGrant}
          onChange={v => setDecision(key, v)}
          t={t}
        />
      </div>
    )
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const items = node.items.filter(i => !i.isLegacy)
    if (items.length === 0 && node.children.length === 0) return null
    const accent = node.color || (node.moduleCode ? getModuleColor(node.moduleCode) : 'var(--text-muted)')

    return (
      <div key={node.id}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 12px', paddingInlineStart: 12 + depth * 18,
          borderInlineStart: depth === 0 ? `3px solid ${accent}` : undefined,
        }}>
          <span style={{ flexGrow: 1, fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 700 : 600, color: 'var(--text)' }}>
            {node.name}
          </span>
          {node.departmentId && (
            <ScopeBadge
              scope="department"
              departments={[access?.departments.find(d => d.id === node.departmentId)?.name ?? '']}
              t={t}
            />
          )}
          {canGrant && items.length > 0 && (
            <>
              <MiniBtn onClick={() => items.forEach(i => setDecision(privilegeKey(i.module, i.code), 'grant'))}>
                {t('grant_all')}
              </MiniBtn>
              <MiniBtn onClick={() => items.forEach(i => setDecision(privilegeKey(i.module, i.code), 'deny'))}>
                {t('deny_all')}
              </MiniBtn>
            </>
          )}
        </div>
        {items.map(renderItem)}
        {node.children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const stats = useMemo(() => {
    const rows = access?.privileges ?? []
    return {
      modules: new Set(rows.filter(r => r.granted).map(r => r.module)).size,
      scoped: rows.filter(r => r.granted && r.scope === 'department').length,
      denied: rows.filter(r => r.source === 'personal_deny').length,
    }
  }, [access])

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      {/* Список сотрудников */}
      <div style={{ ...cardStyle, width: 282, flexShrink: 0, padding: '12px 9px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search_staff')}
          aria-label={t('search_staff')}
          style={{
            width: '100%', padding: '9px 12px', marginBottom: 8, borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 13,
          }}
        />
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {filtered.map(s => {
            const active = s.personId === personId
            return (
              <button
                key={s.personId}
                onClick={() => setPersonId(s.personId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 11px', marginBottom: 2, borderRadius: 9,
                  border: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  background: active ? 'var(--accent-tint)' : 'transparent',
                  cursor: 'pointer', textAlign: 'start',
                }}
              >
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: active ? 700 : 600, color: 'var(--text)' }}>{s.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {s.positionTitle ?? t('person_no_roles')}
                  </span>
                </span>
                {!s.isActive && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>×</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Карточка сотрудника */}
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        {!personId && (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            {t('select_staff')}
          </div>
        )}

        {personId && loading && <div style={{ ...cardStyle, padding: 20 }}><SkeletonRows rows={6} /></div>}

        {personId && !loading && access && (
          <>
            <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 180 }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{access.name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {access.roles.length > 0
                    ? access.roles.map(r => r.name).join(' · ')
                    : t('person_no_roles')}
                </p>
                {access.departments.length > 0 && (
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('person_departments')}: {access.departments.map(d => d.name).join(' · ')}
                  </p>
                )}
              </div>
              <Stat value={stats.modules} label={t('person_modules')} />
              <Stat value={stats.scoped} label={t('person_scoped')} tone="var(--violet)" />
              <Stat value={stats.denied} label={t('person_denied')} tone="var(--danger)" />
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>
              {canGrant ? t('person_hint') : t('no_grant_permission')}
            </p>

            <div style={{ ...cardStyle, padding: '10px 8px' }}>
              {tree.roots.map(r => renderNode(r, 0))}
            </div>

            {canGrant && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <SubmitButton
                  loading={saving}
                  disabled={!dirty}
                  onClick={save}
                  style={{
                    padding: '11px 26px', borderRadius: 10, border: 0,
                    background: dirty ? getModuleColor('data_security') : 'var(--surface-2)',
                    color: dirty ? '#fff' : 'var(--text-muted)',
                    fontSize: 14, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
                  }}
                >{t('save')}</SubmitButton>
                {dirty && (
                  <button
                    onClick={() => setDraft(new Map())}
                    style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
                  >{t('reset')}</button>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('audit_note')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 12px' }}>
      <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: tone ?? 'var(--accent)' }}>{value}</span>
      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)',
        background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11.5,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

/**
 * Три положения вместо галочки: «как у должности» — не то же самое, что
 * «открыто лично». Галочка их смешивает, и тогда снятие «галочки» у права,
 * которое даёт должность, молча превращается в личный запрет.
 */
function ThreeWay({ value, disabled, onChange, t }: {
  value: Decision
  disabled: boolean
  onChange: (v: Decision) => void
  t: T
}) {
  const opt = (v: Decision, label: string, tone: string) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      disabled={disabled}
      aria-pressed={value === v}
      style={{
        padding: '4px 10px', border: 0, borderRadius: 6,
        background: value === v ? tone : 'transparent',
        color: value === v ? '#fff' : 'var(--text-muted)',
        fontSize: 11, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >{label}</button>
  )
  return (
    <span style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--surface-2)', flexShrink: 0 }}>
      {opt('inherit', t('source_role'), 'var(--text-muted)')}
      {opt('grant', t('source_personal_grant'), 'var(--success)')}
      {opt('deny', t('source_personal_deny'), 'var(--danger)')}
    </span>
  )
}
