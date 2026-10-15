'use client'

import { useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

export interface KodeshLevelRow { id: string; name: string; name_he?: string | null; name_en?: string | null }

/**
 * Управление уровнями кодеша (רמות): переименование, создание, скрытие и
 * возврат скрытых. Уровень не удаляют, а скрывают — история остаётся (решение
 * владельца 2026-09-23); при создании — только название.
 *
 * Общий для экрана שיבוץ קודש и кнопки «עריכה» в מרחב הלימודים (владелец
 * 2026-10-14: кнопка рядом с «לימודי קודש» должна открывать редактирование
 * рамот). После любого изменения зовёт onChanged — родитель перечитывает список.
 */
export default function KodeshLevelsManager({ groups, readOnly = false, onChanged }: {
  groups: KodeshLevelRow[]
  readOnly?: boolean
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('education.kodesh')
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const gname = (g: KodeshLevelRow) => (lang === 'he' ? (g.name_he || g.name) : lang === 'en' ? (g.name_en || g.name) : g.name)

  const [err, setErr] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archived, setArchived] = useState<KodeshLevelRow[] | null>(null)

  const loadArchived = async () => {
    try {
      const res = await fetch('/api/education/kodesh/levels')
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? tCommon('load_error')); return }
      const b = await res.json()
      setArchived(b.levels ?? [])
    } catch { setErr(tCommon('load_error')) }
  }

  const renameGroup = async (g: KodeshLevelRow) => {
    const name = editName.trim()
    if (!name) { setEditingGroupId(null); return }
    // Переименование — в поле языка интерфейса (то, что видно на экране, см.
    // gname): RU → name, HE → name_he, EN → name_en.
    const field = lang === 'he' ? 'name_he' : lang === 'en' ? 'name_en' : 'name'
    setSavingName(true); setErr(null)
    try {
      const res = await fetch(`/api/education/class-groups/${g.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: name }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      setEditingGroupId(null)
      await onChanged()
    } catch { setErr(t('save_failed')) }
    finally { setSavingName(false) }
  }

  const createLevel = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true); setErr(null)
    try {
      const res = await fetch('/api/education/kodesh/levels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name_he: name }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(b.error ?? t('save_failed')); return }
      setNewName('')
      await onChanged()
    } catch { setErr(t('save_failed')) }
    finally { setCreating(false) }
  }

  const setLevelActive = async (g: KodeshLevelRow, active: boolean) => {
    if (!active) {
      const ok = await confirmDialog({ message: t('levels_archive_confirm').replace('{name}', gname(g)), confirmLabel: t('levels_archive'), tone: 'danger' })
      if (!ok) return
    }
    setArchivingId(g.id); setErr(null)
    try {
      const res = await fetch(`/api/education/kodesh/levels/${g.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      await onChanged()
      if (showArchived || active) await loadArchived()
    } catch { setErr(t('save_failed')) }
    finally { setArchivingId(null) }
  }

  return (
    <div>
      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>{err}</div>}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
        {groups.map((g, i) => (
          <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            {editingGroupId === g.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  dir="rtl"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') renameGroup(g); if (e.key === 'Escape') setEditingGroupId(null) }}
                  style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
                />
                <button onClick={() => renameGroup(g)} disabled={savingName} style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>{t('levels_save')}</button>
                <button onClick={() => setEditingGroupId(null)} disabled={savingName} style={{ fontSize: 14, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{gname(g)}</span>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => { setEditingGroupId(g.id); setEditName(gname(g)) }}
                      style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {t('levels_rename')}
                    </button>
                    <button
                      onClick={() => setLevelActive(g, false)}
                      disabled={archivingId === g.id}
                      style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', opacity: archivingId === g.id ? 0.55 : 1 }}
                    >
                      {t('levels_archive')}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {groups.length === 0 && (
          <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-muted)' }}>{t('levels_empty')}</div>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              dir="rtl"
              placeholder={t('levels_add_ph')}
              onKeyDown={e => { if (e.key === 'Enter') createLevel() }}
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
            />
            <button
              onClick={createLevel}
              disabled={creating || !newName.trim()}
              style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: creating || !newName.trim() ? 0.55 : 1 }}
            >
              {t('levels_add')}
            </button>
          </div>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => { const next = !showArchived; setShowArchived(next); if (next) loadArchived() }}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {showArchived ? '▾' : '▸'} {t('levels_archived_show')}
        </button>
        {showArchived && archived !== null && (
          <div style={{ marginTop: 6, border: '1px dashed var(--border-strong)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {archived.length === 0 ? (
              <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-muted)' }}>{t('levels_archived_empty')}</div>
            ) : archived.map((g, i) => (
              <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-muted)' }}>{gname(g)}</span>
                {!readOnly && (
                  <button
                    onClick={() => setLevelActive(g, true)}
                    disabled={archivingId === g.id}
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', opacity: archivingId === g.id ? 0.55 : 1 }}
                  >
                    {t('levels_restore')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
