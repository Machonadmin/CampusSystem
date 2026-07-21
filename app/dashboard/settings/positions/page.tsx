'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import type { PositionCategory, ReferencePositionRow } from '@/types/database'

const accent = getModuleColor('settings')

const CATEGORY_COLORS: Record<PositionCategory, { bg: string; fg: string }> = {
  academic:       { bg: 'var(--accent-tint)', fg: 'var(--accent-strong)' },
  administrative: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  support:        { bg: 'var(--success-tint)', fg: 'var(--success)' },
}

interface ModalState {
  mode: 'create' | 'edit'
  item: ReferencePositionRow | null
}

export default function PositionsPage() {
  const t = useTranslations('settings.reference_positions')
  const tNav = useTranslations('navigation')
  const [positions, setPositions] = useState<ReferencePositionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterCategory, setFilterCategory] = useState<PositionCategory | ''>('')
  const [showInactive, setShowInactive] = useState(false)

  const [modal, setModal] = useState<ModalState | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)  // прогрессивное раскрытие: детали строки по клику

  const CATEGORY_LABELS: Record<PositionCategory, string> = {
    academic: t('cat_academic'),
    administrative: t('cat_administrative'),
    support: t('cat_support'),
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterCategory) params.set('category', filterCategory)
      params.set('active_only', showInactive ? 'false' : 'true')
      const resp = await fetch(`/api/settings/positions?${params}`)
      if (!resp.ok) throw new Error(t('error_load').replace('{status}', String(resp.status)))
      const json = await resp.json()
      setPositions(json.positions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_generic'))
    } finally {
      setLoading(false)
    }
  }, [filterCategory, showInactive, t])

  useEffect(() => { loadData() }, [loadData])

  const handleDeactivate = async (pos: ReferencePositionRow) => {
    if (!confirm(t('deactivate_confirm').replace('{name}', pos.name_ru))) return
    try {
      const resp = await fetch(`/api/settings/positions/${pos.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('error_generic'), 'error')
        return
      }
      loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('error_generic'), 'error')
    }
  }

  const handleRestore = async (pos: ReferencePositionRow) => {
    try {
      const resp = await fetch(`/api/settings/positions/${pos.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('error_generic'), 'error')
        return
      }
      loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('error_generic'), 'error')
    }
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none',
  }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('settings'),
          padding: '16px 24px',
          boxShadow: '0 2px 8px rgba(30,64,175,0.2)',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>
          {t('title')}
        </h1>
      </div>

      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as PositionCategory | '')} style={inp}>
          <option value="">{t('all_categories')}</option>
          <option value="academic">{t('cat_academic')}</option>
          <option value="administrative">{t('cat_administrative')}</option>
          <option value="support">{t('cat_support')}</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('show_inactive')}
        </label>

        <div style={{ flex: 1 }} />

        <PageActionButton
          label={t('add_button')}
          onClick={() => setModal({ mode: 'create', item: null })}
          accentColor={accent}
        />
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('loading')}</div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        positions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
            {filterCategory ? t('empty_search') : t('empty_none')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('table_position')}</th>
                  <th style={thStyle}>{t('table_hebrew')}</th>
                  <th style={thStyle}>{t('table_category')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('table_status')}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => {
                  const catStyle = CATEGORY_COLORS[pos.category]
                  const open = expandedId === pos.id
                  return (
                    <Fragment key={pos.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : pos.id)}
                        style={{ borderTop: '1px solid var(--surface-2)', opacity: pos.is_active ? 1 : 0.55, cursor: 'pointer', background: open ? 'var(--surface-2)' : undefined }}
                        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-faint)', transition: 'transform .15s', transform: `rotate(${open ? 90 : 0}deg)` }}>▶</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pos.name_ru}</span>
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', direction: 'rtl' }}>
                          {pos.name_he ?? <span style={{ color: 'var(--border-strong)' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                            background: catStyle.bg, color: catStyle.fg,
                          }}>
                            {CATEGORY_LABELS[pos.category]}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {pos.is_active
                            ? <span style={{ color: 'var(--success)', fontWeight: 500 }}>{t('status_active')}</span>
                            : <span style={{ color: 'var(--text-faint)' }}>{t('status_inactive')}</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: 'var(--surface-2)', opacity: pos.is_active ? 1 : 0.55 }}>
                          <td colSpan={4} style={{ padding: '2px 16px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 22px', paddingInlineStart: 16 }}>
                              <Detail label={t('table_teaching')} value={pos.is_teaching ? t('yes') : '—'} />
                              <Detail label={t('table_sort_order')} value={String(pos.sort_order)} />
                            </div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 12, paddingInlineStart: 16, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => setModal({ mode: 'edit', item: pos })} style={btnSecondary}>
                                {t('edit')}
                              </button>
                              {pos.is_active ? (
                                <button
                                  onClick={() => handleDeactivate(pos)}
                                  style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                >
                                  {t('deactivate')}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestore(pos)}
                                  style={{ ...btnSecondary, color: 'var(--success)', borderColor: 'var(--success)' }}
                                >
                                  {t('restore')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modal && (
        <PositionModal
          mode={modal.mode}
          initial={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadData() }}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  mode: 'create' | 'edit'
  initial: ReferencePositionRow | null
  onClose: () => void
  onSaved: () => void
}

function PositionModal({ mode, initial, onClose, onSaved }: ModalProps) {
  const t = useTranslations('settings.reference_positions')
  const [nameRu, setNameRu] = useState(initial?.name_ru ?? '')
  const [nameHe, setNameHe] = useState(initial?.name_he ?? '')
  const [category, setCategory] = useState<PositionCategory>(initial?.category ?? 'academic')
  const [isTeaching, setIsTeaching] = useState(initial?.is_teaching ?? false)
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 100))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CATEGORY_LABELS: Record<PositionCategory, string> = {
    academic: t('cat_academic'),
    administrative: t('cat_administrative'),
    support: t('cat_support'),
  }

  useEffect(() => {
    if (category !== 'academic') setIsTeaching(false)
  }, [category])

  const handleSubmit = async () => {
    const trimmed = nameRu.trim()
    if (!trimmed) { setError(t('name_required')); return }

    setSaving(true)
    setError(null)
    try {
      const body = {
        name_ru: trimmed,
        name_he: nameHe.trim() || null,
        category,
        is_teaching: isTeaching,
        sort_order: Number(sortOrder) || 100,
      }

      const url = mode === 'edit' && initial ? `/api/settings/positions/${initial.id}` : '/api/settings/positions'
      const method = mode === 'edit' ? 'PATCH' : 'POST'

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? t('save_error'))
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_generic'))
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)', position: 'relative',
        }}
      >
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 16,
          background: 'none', border: 'none', fontSize: 22, color: 'var(--text-faint)', cursor: 'pointer', lineHeight: 1,
        }}>×</button>

        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px 0', color: 'var(--text)' }}>
          {mode === 'create' ? t('modal_create_title') : t('modal_edit_title')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>{t('name_ru_label')} *</label>
            <input value={nameRu} onChange={e => setNameRu(e.target.value)} placeholder={t('name_ru_placeholder')} style={inp} />
          </div>

          <div>
            <label style={lbl}>{t('name_he_label')}</label>
            <input value={nameHe} onChange={e => setNameHe(e.target.value)} placeholder="מורה" dir="rtl" style={inp} />
          </div>

          <div>
            <label style={lbl}>{t('category_label')} *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['academic', 'administrative', 'support'] as PositionCategory[]).map(cat => (
                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="category" checked={category === cat} onChange={() => setCategory(cat)} />
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                    background: CATEGORY_COLORS[cat].bg, color: CATEGORY_COLORS[cat].fg,
                  }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
            opacity: category !== 'academic' ? 0.4 : 1,
            userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={isTeaching}
              disabled={category !== 'academic'}
              onChange={e => setIsTeaching(e.target.checked)}
            />
            {t('is_teaching_label')}
            {category !== 'academic' && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('is_teaching_hint')}</span>
            )}
          </label>

          <div>
            <label style={lbl}>{t('sort_order_label')}</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inp, width: 100 }} />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', fontSize: 13, color: 'var(--text-muted)',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
          }}>
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
              background: accent, border: 'none', borderRadius: 8,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? t('saving') : mode === 'create' ? t('add_confirm_button') : t('save_button')}
          </button>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }

// Пара «метка → значение» в раскрытой панели деталей строки.
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
