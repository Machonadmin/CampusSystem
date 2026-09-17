'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { getModuleColor } from '@/lib/module-colors'
import type { BuiltTree, TreeNode, CatalogEntry } from '@/lib/data-security/tree'
import { privilegeKey, collectPrivileges } from '@/lib/data-security/tree'
import type { ResolvedPrivilege } from '@/lib/data-security/person'
import type { StaffSummary, PersonAccess } from '@/lib/data-security/load'
import type { UnitNode } from '@/lib/data-security/units'
import SeatEditor from './SeatEditor'
import {
  LevelBadge, RiskBadge, ScopeBadge, SourceBadge, PrivilegeName,
  AreaTile, BackToAreas, cardStyle, type T,
} from './shared'

// ─── Вид «по сотруднику»: здесь утверждают доступ ────────────────────────────
//
// Путь ровно в три шага, и на каждом видно только его содержимое:
//   человек → раздел → права внутри раздела.
// Так прямо попросил владелец: «захожу к человеку — хочу утвердить ему
// определённые вещи внутри определённой области, это должно быть лёгким,
// понятным, простым». Прошлая версия вываливала все 141 право сразу, и это
// читалось как каша.
//
// Поиск — четвёртый путь, а не четвёртый шаг: если известно, ЧТО открыть,
// набранное слово даёт плоский список по всем разделам, и разделы обходятся.
//
// Меняются ТОЛЬКО личные решения (person_privileges). Права должности отсюда не
// правятся намеренно: это задело бы всех её держателей разом, а экран — про
// одного человека.

type Decision = 'inherit' | 'grant' | 'deny'

export default function PersonView({ tree, staff, units, canGrant, canManageUnits, t, lang }: {
  tree: BuiltTree
  staff: StaffSummary[]
  units: UnitNode[]
  canGrant: boolean
  canManageUnits: boolean
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
  const [seatOpen, setSeatOpen] = useState(false)
  /** Открытый раздел. null — показан список разделов. */
  const [areaId, setAreaId] = useState<string | null>(null)
  const [privQuery, setPrivQuery] = useState('')

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
  const decisionOf = useCallback((key: string): Decision => {
    const drafted = draft.get(key)
    if (drafted) return drafted
    const r = resolved.get(key)
    if (!r) return 'inherit'
    if (r.source === 'personal_grant' && !r.expired) return 'grant'
    if (r.source.startsWith('personal_deny') && !r.expired) return 'deny'
    return 'inherit'
  }, [draft, resolved])

  /** Открыто ли право по факту — с учётом несохранённого решения. */
  const isOpen = useCallback((key: string): boolean => {
    const d = decisionOf(key)
    if (d === 'grant') return true
    if (d === 'deny') return false
    return resolved.get(key)?.granted === true
  }, [decisionOf, resolved])

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
        const [moduleCode, code] = key.split('::')
        const d = decisionOf(key)
        if (d === 'grant') overrides.push({ module: moduleCode, privilege_code: code, is_granted: true })
        else if (d === 'deny') overrides.push({ module: moduleCode, privilege_code: code, is_granted: false })
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

  // ── Разделы ───────────────────────────────────────────────────────────────
  /** Живые (не устаревшие) права раздела вместе со всем, что под ним. */
  const livePrivileges = useCallback(
    (node: TreeNode) => collectPrivileges(node).filter(i => !i.isLegacy),
    [],
  )

  const area = useMemo(
    () => (areaId ? tree.roots.find(r => r.id === areaId) ?? null : null),
    [areaId, tree.roots],
  )

  /** Плоский результат поиска по всем разделам: «знаю что искать». */
  const searchHits = useMemo(() => {
    const q = privQuery.trim().toLowerCase()
    if (!q) return []
    const hits: { area: TreeNode; item: CatalogEntry }[] = []
    for (const root of tree.roots) {
      for (const item of livePrivileges(root)) {
        const hay = `${item.name ?? ''} ${item.description ?? ''} ${root.name ?? ''}`.toLowerCase()
        if (hay.includes(q)) hits.push({ area: root, item })
      }
    }
    return hits.slice(0, 60)
  }, [privQuery, tree.roots, livePrivileges])

  // ── Строка права ──────────────────────────────────────────────────────────
  const renderItem = (item: CatalogEntry, caption?: string) => {
    const key = privilegeKey(item.module, item.code)
    const r = resolved.get(key)
    const decision = decisionOf(key)
    const changed = draft.has(key)
    const open = isOpen(key)

    return (
      <div key={key} className="ds-row" style={{
        padding: '9px 12px',
        borderRadius: 9,
        background: changed ? 'var(--warn-tint)' : 'transparent',
        borderBottom: '1px solid var(--border)',
      }}>
        <span aria-hidden style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          background: open ? 'var(--success)' : 'transparent',
          border: open ? 'none' : '1.5px solid var(--border)',
        }} />

        <span className="ds-grow" style={{ fontSize: 13.5, color: 'var(--text)' }}>
          <PrivilegeName name={item.name} t={t} />
          {caption && (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{caption}</span>
          )}
        </span>

        {/* Значок источника — только когда он что-то добавляет: личное решение
            или просроченная строка. «Из должности» и так видно по положению. */}
        {r && (r.expired || r.source !== 'role') && (
          <SourceBadge source={r.source} expiresAt={r.expiresAt} expired={r.expired} t={t} lang={lang} />
        )}
        {open && r?.scope === 'department' && (
          <ScopeBadge scope="department" departments={deptNames} t={t} />
        )}
        <RiskBadge risk={item.risk} t={t} />
        <LevelBadge level={item.level} t={t} />

        <ThreeWay value={decision} disabled={!canGrant} onChange={v => setDecision(key, v)} t={t} />
      </div>
    )
  }

  /** Подгруппы внутри раздела: заголовок-строка, под ней права. */
  const renderGroup = (node: TreeNode, depth: number): React.ReactNode => {
    const items = node.items.filter(i => !i.isLegacy)
    if (items.length === 0 && node.children.length === 0) return null
    return (
      <div key={node.id} style={{ marginTop: depth === 0 ? 0 : 10 }}>
        {depth > 0 && (
          <div className="ds-row" style={{ padding: '8px 12px' }}>
            <span className="ds-grow" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>
              {node.name}
            </span>
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
        )}
        {items.map(i => renderItem(i))}
        {node.children.map(c => renderGroup(c, depth + 1))}
      </div>
    )
  }

  const openCount = useMemo(() => {
    const rows = access?.privileges ?? []
    return {
      open: rows.filter(r => isOpen(privilegeKey(r.module, r.code))).length,
      denied: rows.filter(r => decisionOf(privilegeKey(r.module, r.code)) === 'deny').length,
    }
  }, [access, isOpen, decisionOf])

  return (
    <div className="ds-split">
      {/* Список сотрудников */}
      <div style={{ ...cardStyle, padding: '12px 9px' }}>
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
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          {filtered.map(s => {
            const active = s.personId === personId
            return (
              <button
                key={s.personId}
                onClick={() => { setPersonId(s.personId); setAreaId(null); setPrivQuery('') }}
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
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
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
      <div style={{ minWidth: 0 }}>
        {!personId && (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            {t('select_staff')}
          </div>
        )}

        {personId && loading && <div style={{ ...cardStyle, padding: 20 }}><SkeletonRows rows={6} /></div>}

        {personId && !loading && access && (
          <>
            <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                {access.name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                {access.roles.length > 0 ? access.roles.map(r => r.name).join(' · ') : t('person_no_roles')}
                {' · '}
                {t('area_open_count')
                  .replace('{n}', String(openCount.open))
                  .replace('{total}', String(access.privileges.length))}
              </p>

              <div className="ds-row" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('seat_title')}:</span>
                {access.departments.length > 0 ? access.departments.map(d => (
                  <span key={d.id} style={{ padding: '3px 10px', borderRadius: 7, background: 'var(--violet-tint)', color: 'var(--violet)', fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{d.name}</span>
                )) : (
                  // Не красным: отсутствие единицы — НЕ ошибка. Единица нужна
                  // только тому, кто работает со списками студенток; остальным
                  // личной выдачи достаточно (lib/permissions/module-factory.ts
                  // не смотрит на scope вовсе).
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('seat_none')}</span>
                )}
                {canManageUnits && (
                  <button
                    onClick={() => setSeatOpen(true)}
                    style={{ padding: '3px 11px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer' }}
                  >{t('seat_edit')}</button>
                )}
              </div>
            </div>

            <div className="ds-row" style={{ marginBottom: 12 }}>
              {area && <BackToAreas label={t('back_to_areas')} onClick={() => setAreaId(null)} />}
              <input
                type="text"
                value={privQuery}
                onChange={e => setPrivQuery(e.target.value)}
                placeholder={t('search_privilege')}
                aria-label={t('search_privilege')}
                className="ds-grow"
                style={{
                  padding: '9px 13px', borderRadius: 9,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 13,
                }}
              />
            </div>

            {/* 1. Поиск перекрывает всё: человек уже знает, что ищет. */}
            {privQuery.trim() ? (
              <div style={{ ...cardStyle, padding: '6px 8px' }}>
                {searchHits.length === 0 ? (
                  <p style={{ margin: 0, padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                    {t('no_results')}
                  </p>
                ) : searchHits.map(h => renderItem(h.item, h.area.name ?? undefined))}
              </div>
            ) : !area ? (
              // 2. Разделы: один взгляд — где что открыто.
              <>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {canGrant ? t('area_pick_person') : t('no_grant_permission')}
                </p>
                <div className="ds-tiles">
                  {tree.roots.map(root => {
                    const all = livePrivileges(root)
                    if (all.length === 0) return null
                    const open = all.filter(i => isOpen(privilegeKey(i.module, i.code))).length
                    return (
                      <AreaTile
                        key={root.id}
                        name={root.name ?? ''}
                        accent={root.color || (root.moduleCode ? getModuleColor(root.moduleCode) : 'var(--border)')}
                        caption={t('area_open_count')
                          .replace('{n}', String(open))
                          .replace('{total}', String(all.length))}
                        onClick={() => setAreaId(root.id)}
                      />
                    )
                  })}
                </div>
              </>
            ) : (
              // 3. Внутри раздела — только его права.
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {area.name}
                </h3>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {canGrant ? t('decision_hint') : t('no_grant_permission')}
                </p>
                <div style={{ ...cardStyle, padding: '6px 8px' }}>
                  {renderGroup(area, 0) ?? (
                    <p style={{ margin: 0, padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('area_empty')}
                    </p>
                  )}
                </div>
              </>
            )}

            {canGrant && (
              <div className="ds-savebar">
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
                  <>
                    <button
                      onClick={() => setDraft(new Map())}
                      style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
                    >{t('reset')}</button>
                    <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>
                      {t('unsaved_count').replace('{n}', String(draft.size))}
                    </span>
                  </>
                )}
                {!dirty && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('audit_note')}</span>
                )}
              </div>
            )}
          </>
        )}

        {seatOpen && access && (
          <SeatEditor
            person={access}
            units={units}
            t={t}
            onClose={() => setSeatOpen(false)}
            onSaved={next => { setAccess(next); setDraft(new Map()) }}
          />
        )}
      </div>
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
 *
 * Подписи короткие намеренно: длинные («ניתן אישית») растягивали строку так,
 * что на телефоне она уезжала за край.
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
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >{label}</button>
  )
  return (
    <span style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--surface-2)', flexShrink: 0 }}>
      {opt('inherit', t('decision_inherit'), 'var(--text-muted)')}
      {opt('grant', t('decision_grant'), 'var(--success)')}
      {opt('deny', t('decision_deny'), 'var(--danger)')}
    </span>
  )
}
