'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// Заморожено по просьбе владельца: пока преждевременно (у уровней ещё нет
// расписания). Прячем кнопку «יצירת כל השיעורים»; вернёмся позже — снять флаг.
const GEN_ALL_FROZEN = true

interface Group { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Student {
  journey_id: string
  name: string
  department: string | null
  kodesh_group_id: string | null
}

export default function KodeshAssignmentPage() {
  const t = useTranslations('education.kodesh')
  const { lang } = useLang()
  // Имя уровня кодеша на языке интерфейса (name=RU / name_he=HE / name_en=EN).
  const gname = (g: Group) => (lang === 'he' ? (g.name_he || g.name) : lang === 'en' ? (g.name_en || g.name) : g.name)
  const tNav = useTranslations('navigation')

  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [noAccess, setNoAccess] = useState(false)
  // Фильтр по уровню: '' = все, 'unassigned' = ещё не распределённые, иначе id
  // уровня. Инициализируется из ?level= (клик по карточке уровня из מרחב הלימודים
  // ведёт сюда с конкретным уровнем — «נכנס לרמה א' → רואה רק רמה א'»).
  const searchParams = useSearchParams()
  const [levelFilter, setLevelFilter] = useState<string>(() => searchParams.get('level') ?? '')
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setNoAccess(false)
    try {
      const res = await fetch('/api/education/kodesh/assignment')
      if (res.status === 403) { setNoAccess(true); return }
      if (res.ok) {
        const b = await res.json()
        setGroups(b.groups ?? [])
        setStudents(b.students ?? [])
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const unassignedCount = useMemo(
    () => students.filter(s => s.kodesh_group_id === null).length,
    [students],
  )
  const visible = useMemo(() => {
    if (levelFilter === '') return students
    if (levelFilter === 'unassigned') return students.filter(s => s.kodesh_group_id === null)
    return students.filter(s => s.kodesh_group_id === levelFilter)
  }, [students, levelFilter])

  const assign = async (journeyId: string, rawValue: string) => {
    const groupId = rawValue === '' ? null : rawValue
    const prev = students
    setBusyId(journeyId); setErr(null)
    // Оптимистичное обновление.
    setStudents(list => list.map(s => s.journey_id === journeyId ? { ...s, kodesh_group_id: groupId } : s))
    try {
      const res = await fetch('/api/education/kodesh/assignment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: journeyId, group_id: groupId }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.error ?? t('save_failed'))
        setStudents(prev) // откат
      }
    } catch {
      setErr(t('save_failed'))
      setStudents(prev)
    } finally { setBusyId(null) }
  }

  // Разово породить уроки для ВСЕХ групп кодеша за их период (удобство: иначе
  // «Generate» нажимается в каждой группе отдельно). Строго добавляющее.
  const generateAll = async () => {
    if (groups.length === 0) return
    setGenBusy(true); setGenMsg(null); setErr(null)
    let created = 0, skipped = 0, failed = 0
    for (const g of groups) {
      try {
        const res = await fetch(`/api/education/class-groups/${g.id}/schedule/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        })
        if (res.ok) {
          const b = await res.json().catch(() => ({}))
          created += Number(b.created ?? 0); skipped += Number(b.skipped ?? 0)
        } else { failed++ }
      } catch { failed++ }
    }
    setGenBusy(false)
    setGenMsg(t('gen_all_result', '{created} · {skipped} · {failed}')
      .replace('{created}', String(created)).replace('{skipped}', String(skipped)).replace('{failed}', String(failed)))
  }

  if (noAccess) {
    return (
      <div className="p-6 space-y-5">
        <Breadcrumb items={[
          { label: tNav('home'), href: '/dashboard' },
          { label: tNav('education'), href: '/dashboard/education' },
          { label: t('title') },
        ]} />
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>{t('no_access')}</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 14, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      {loading ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: unassignedCount > 0 ? 'var(--warn)' : 'var(--success)',
              background: unassignedCount > 0 ? 'var(--warn-tint)' : 'var(--success-tint)',
              border: `1px solid ${unassignedCount > 0 ? 'var(--warn)' : 'var(--success)'}`,
              borderRadius: 8, padding: '6px 12px',
            }}>
              {t('unassigned_count', '{n}').replace('{n}', String(unassignedCount))}
            </div>
            {/* Фильтр по уровню: הכל · רמה א'..ו' · לא משובצות. Показываем только
                выбранный уровень (владелец: «נכנס לרמה א' רואה רק את רמה א'»). */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {[{ id: '', label: t('all') }, ...groups.map(g => ({ id: g.id, label: gname(g) })), { id: 'unassigned', label: t('only_unassigned') }].map(chip => {
                const active = levelFilter === chip.id
                return (
                  <button
                    key={chip.id || 'all'}
                    type="button"
                    onClick={() => setLevelFilter(chip.id)}
                    style={{
                      fontSize: 12.5, fontWeight: active ? 700 : 500, padding: '5px 11px', borderRadius: 999,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      border: `1px solid ${active ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
                      background: active ? 'var(--accent-tint)' : 'var(--surface)',
                      color: active ? 'var(--accent-strong)' : 'var(--text-muted)',
                    }}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>
            <div style={{ flex: 1 }} />
            {!GEN_ALL_FROZEN && (
              <button
                onClick={generateAll}
                disabled={genBusy || groups.length === 0}
                title={t('gen_all_hint', '')}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
                  border: '1px solid var(--accent-strong)', background: 'var(--accent-tint)',
                  color: 'var(--accent-strong)', cursor: genBusy || groups.length === 0 ? 'default' : 'pointer',
                  opacity: genBusy || groups.length === 0 ? 0.55 : 1,
                }}
              >
                {genBusy ? t('gen_all_busy', '…') : t('gen_all', 'Generate all lessons')}
              </button>
            )}
          </div>

          {!GEN_ALL_FROZEN && genMsg && (
            <div style={{ padding: '9px 13px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>{genMsg}</div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
              <div style={{ flex: 1, minWidth: 160 }}>{t('student_col')}</div>
              <div style={{ minWidth: 180 }}>{t('group_col')}</div>
            </div>
            {visible.length === 0 ? (
              <EmptyState text={t('no_students')} />
            ) : visible.map((s, i) => {
              const unassigned = s.kodesh_group_id === null
              return (
                <div key={s.journey_id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</div>
                    {s.department && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{s.department}</div>}
                  </div>
                  <select
                    value={s.kodesh_group_id ?? ''}
                    disabled={busyId === s.journey_id}
                    onChange={e => assign(s.journey_id, e.target.value)}
                    style={{
                      minWidth: 180, padding: '7px 10px', fontSize: 13, borderRadius: 8,
                      border: `1px solid ${unassigned ? 'var(--warn)' : 'var(--border-strong)'}`,
                      background: 'var(--surface)', color: 'var(--text)',
                      opacity: busyId === s.journey_id ? 0.55 : 1,
                    }}
                  >
                    <option value="">{t('unassigned_option')}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{gname(g)}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
