'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { DownloadIcon } from '@/components/ui/DownloadIcon'
import { downloadCsv } from '@/lib/csv'
import { firstPhone } from '@/lib/persons/phone'
import { SkeletonRows } from '@/components/ui/Skeleton'

type Tab = 'staff' | 'students' | 'leads'

interface StaffItem {
  person_id: string
  full_name: string
  hebrew_name: string | null
  position: string | null
  positions: string[]
  department: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
}

interface StudentItem {
  journey_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  education_status: string
  department: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
}

// Лид (в процессе набора). Держим те же поля-заглушки (hebrew_name/department),
// что и у остальных, чтобы список рендерился единообразно.
interface LeadItem {
  lead_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  department: string | null
  referral_source: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
}

type Row = StaffItem | StudentItem | LeadItem

function isStudent(row: Row): row is StudentItem {
  return 'journey_id' in row
}
function isLead(row: Row): row is LeadItem {
  return 'lead_id' in row
}

export default function PersonsClient() {
  const t = useTranslations('persons')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const primary = getModuleColor('persons', 'primary')
  const light = getModuleColor('persons', 'light')

  const [tab, setTab] = useState<Tab>('staff')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Дебаунс запроса поиска: поиск делается на сервере (app-side), поэтому не
  // бьём БД на каждое нажатие клавиши.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Лиды приходят из отдельного эндпойнта набора (все, кто в процессе).
      // У него нет серверного поиска — фильтруем на клиенте.
      if (tab === 'leads') {
        const res = await fetch('/api/education/leads?process_status=active')
        if (res.status === 403) { setError(t('list.forbidden')); setRows([]); setTotal(0); return }
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          setError(b.error ?? t('list.load_error')); setRows([]); setTotal(0); return
        }
        const raw = await res.json() as Array<{
          profile_id: string; person_id: string; full_name: string
          referral_source: string | null; email: string | null; phones: string[]; photo_url: string | null
        }>
        let list: LeadItem[] = raw.map(l => ({
          lead_id: l.profile_id, person_id: l.person_id, full_name: l.full_name,
          hebrew_name: null, department: null, referral_source: l.referral_source ?? null,
          email: l.email ?? null, phones: Array.isArray(l.phones) ? l.phones : [], photo_url: l.photo_url ?? null,
        }))
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase()
          list = list.filter(l =>
            l.full_name.toLowerCase().includes(q) ||
            (l.email ?? '').toLowerCase().includes(q) ||
            l.phones.join(' ').toLowerCase().includes(q))
        }
        setRows(list); setTotal(list.length)
        return
      }

      const qs = new URLSearchParams({ pageSize: '200' })
      if (debouncedSearch) qs.set('search', debouncedSearch)
      const res = await fetch(`/api/persons/${tab}?${qs.toString()}`)
      if (res.status === 403) { setError(t('list.forbidden')); setRows([]); setTotal(0); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setRows([]); setTotal(0); return
      }
      const b = await res.json()
      const list: Row[] = tab === 'staff' ? (b.staff ?? []) : (b.students ?? [])
      setRows(list)
      setTotal(typeof b.total === 'number' ? b.total : list.length)
    } catch {
      setError(t('list.load_error')); setRows([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [tab, debouncedSearch, t])

  useEffect(() => { load() }, [load])

  function openPerson(personId: string) {
    router.push(`/dashboard/persons/${personId}`)
  }

  function exportCsv() {
    const headers = [t('title'), t('fields.phone'), t('fields.email'), t('fields.roles')]
    const data = rows.map(r => [
      r.full_name,
      r.phones.join(' '),
      r.email ?? '',
      isStudent(r) ? t('education_status.student')
        : isLead(r) ? (r.referral_source ?? t('tabs.leads'))
        : (r.position ?? ''),
    ])
    downloadCsv('persons', [headers, ...data])
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <ModuleHeader module="persons" title={t('title')} subtitle={t('list.subtitle')} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
        {(['staff', 'students', 'leads'] as Tab[]).map(tb => {
          const active = tab === tb
          return (
            <button
              key={tb}
              onClick={() => { setTab(tb); setSearch('') }}
              style={{
                fontSize: 14, fontWeight: 600, padding: '10px 16px', border: 'none',
                background: 'none', cursor: 'pointer',
                color: active ? primary : 'var(--text-muted)',
                borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t(`tabs.${tb}`)}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }}
        />
        {!loading && !error && (
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {t('list.count').replace('{count}', String(total))}
          </span>
        )}
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 600, padding: '9px 14px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: rows.length === 0 ? 'var(--text-faint)' : 'var(--text)', cursor: rows.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
        >
          <DownloadIcon /> {tCommon('export_csv')}
        </button>
      </div>

      {/* List */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
        {error ? (
          <div style={{ fontSize: 13, color: 'var(--danger)', padding: 8 }}>{error}</div>
        ) : loading ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: 8 }}>{t('list.empty')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map(row => (
              <PersonRow
                key={isStudent(row) ? row.journey_id : isLead(row) ? row.lead_id : row.person_id}
                row={row}
                light={light}
                primary={primary}
                deptLabel={t('fields.department')}
                studentLabel={t('education_status.student')}
                leadLabel={t('tabs.leads')}
                onClick={() => openPerson(row.person_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PersonRow({
  row, light, primary, deptLabel, studentLabel, leadLabel, onClick,
}: {
  row: Row
  light: string
  primary: string
  deptLabel: string
  studentLabel: string
  leadLabel: string
  onClick: () => void
}) {
  const phone = firstPhone(row.phones)
  const secondary = isStudent(row)
    ? studentLabel
    : isLead(row)
      ? (row.referral_source || leadLabel)
      : (row.position ?? null)

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        border: '1px solid var(--surface-2)', borderRadius: 10, cursor: 'pointer', background: 'var(--surface)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)' }}
    >
      <Avatar name={row.full_name} photoUrl={row.photo_url} light={light} primary={primary} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.full_name}
        </div>
        {row.hebrew_name && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', direction: 'rtl' }}>{row.hebrew_name}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {secondary && <span>{secondary}</span>}
          {row.department && (
            <span style={{ color: 'var(--text-faint)' }}>· {deptLabel}: {row.department}</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'end', minWidth: 0 }}>
        {row.email && <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{row.email}</div>}
        {phone && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{phone}</div>}
      </div>
    </div>
  )
}

function Avatar({ name, photoUrl, light, primary }: { name: string; photoUrl: string | null; light: string; primary: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
      background: light, color: primary, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 14, fontWeight: 700,
    }}>
      {initials || '?'}
    </div>
  )
}
