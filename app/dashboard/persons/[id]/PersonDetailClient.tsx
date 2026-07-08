'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface PersonDetail {
  id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  gender: string | null
  birth_date: string | null
  roles: { code: string; name: string }[]
  positions: string[]
  department: string | null
  is_student: boolean
  journey_id: string | null
  education_status: string | null
}

export default function PersonDetailClient({
  personId, canViewStudentCards,
}: {
  personId: string
  canViewStudentCards: boolean
}) {
  const t = useTranslations('persons')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('persons', 'primary')
  const light = getModuleColor('persons', 'light')

  const [data, setData] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/persons/directory/${personId}`)
      if (res.status === 404) { setError(t('detail.not_found')); setData(null); return }
      if (res.status === 403) { setError(t('list.forbidden')); setData(null); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setData(null); return
      }
      setData(await res.json())
    } catch {
      setError(t('list.load_error')); setData(null)
    } finally {
      setLoading(false)
    }
  }, [personId, t])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/persons' },
        { label: data?.full_name || t('detail.title') },
      ]} />

      {error ? (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, fontSize: 13, color: '#DC2626' }}>
          {error}
        </div>
      ) : loading || !data ? (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, fontSize: 13, color: '#9CA3AF' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          {/* Header card */}
          <div style={{
            background: getModuleHeaderGradient('persons'),
            borderRadius: 12, padding: '20px 24px', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <Avatar name={data.full_name} photoUrl={data.photo_url} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{data.full_name}</h1>
              {data.hebrew_name && (
                <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2, direction: 'rtl' }}>{data.hebrew_name}</div>
              )}
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.is_student && <Badge>{t('education_status.student')}</Badge>}
                {data.positions.map(p => <Badge key={p}>{p}</Badge>)}
              </div>
            </div>
          </div>

          {/* Info card */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Info label={t('fields.email')} value={data.email} />
            <Info label={t('fields.phone')} value={data.phones.join(', ') || null} />
            <Info label={t('fields.department')} value={data.department} />
            <Info
              label={t('fields.roles')}
              value={data.roles.length ? data.roles.map(r => r.name).join(', ') : null}
            />
            <Info label={t('fields.gender')} value={data.gender ? t(`gender.${data.gender}`) : null} />
            <Info label={t('fields.birth_date')} value={data.birth_date} />
          </div>

          {/* Student card link */}
          {data.is_student && data.journey_id && canViewStudentCards && (
            <Link
              href={`/dashboard/education/students/${data.journey_id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600,
                padding: '10px 18px', borderRadius: 8, background: light, color: primary,
                textDecoration: 'none',
              }}
            >
              {t('detail.student_card_link')}
              <span aria-hidden>→</span>
            </Link>
          )}
        </>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? '#1F2937' : '#9CA3AF', marginTop: 3 }}>{value || '—'}</div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
      background: 'rgba(255,255,255,0.22)', color: '#fff',
    }}>
      {children}
    </span>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.5)' }} />
    )
  }
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,255,255,0.22)', color: '#fff', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700,
    }}>
      {initials || '?'}
    </div>
  )
}
