'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import ClassGroupTeachers from '@/app/dashboard/education/components/ClassGroupTeachers'
import ClassGroupStudents from '@/app/dashboard/education/components/ClassGroupStudents'
import LessonsJournalTab from '@/app/dashboard/education/components/LessonsJournalTab'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Teacher {
  person_id: string
  full_name: string | null
  is_primary: boolean
}

interface StudentMini {
  id: string
  status: string
  person: {
    id: string
    full_name: string
    hebrew_name: string | null
    email: string | null
  } | null
  main_group: { id: string; name: string } | null
}

interface ClassGroupDetail {
  id: string
  name: string
  level: string | null
  period_start: string | null
  period_end: string | null
  notes: string | null
  is_active: boolean
  subject: { id: string; name: string } | null
  department: { id: string; name: string } | null
  teachers: Teacher[]
  students: StudentMini[]
}

interface Props {
  groupId: string
  canViewLessons: boolean
  canManageLessons: boolean
  canMarkAttendance: boolean
}

function formatPeriod(lang: string, start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} — ${fmt(end)}`
  if (start) return `${fmt(start)} →`
  return `→ ${fmt(end!)}`
}

export default function ClassGroupCardClient({ groupId, canViewLessons, canManageLessons, canMarkAttendance }: Props) {
  const router = useRouter()
  const t = useTranslations('education.study')
  const tJournal = useTranslations('education.journal')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [group, setGroup] = useState<ClassGroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'journal'>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}`)
      if (!resp.ok) {
        if (resp.status === 404) {
          setError(t('class_groups.card_not_found'))
          setLoading(false)
          return
        }
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? `${t('common.error_generic')} ${resp.status}`)
      }
      const data = await resp.json()
      setGroup(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [groupId, t])

  useEffect(() => { load() }, [load])

  const accent = getModuleColor('education')

  if (loading) {
    return (
      <div className="p-6">
        <div style={{ color: '#6B7280', textAlign: 'center', padding: 48 }}>{t('common.loading')}</div>
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumb items={[
          { label: tNav('home'), href: '/dashboard' },
          { label: tNav('education'), href: '/dashboard/education' },
          { label: t('class_groups.card_not_found') },
        ]} />
        <div style={{
          padding: 24, background: '#FEE2E2', color: '#991B1B',
          borderRadius: 8, fontSize: 14,
        }}>
          {error ?? t('class_groups.group_not_found_short')}
        </div>
        <button
          onClick={() => router.push('/dashboard/education')}
          style={{
            padding: '8px 16px', fontSize: 13, color: '#374151',
            background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer',
          }}
        >
          {t('class_groups.back_to_list')}
        </button>
      </div>
    )
  }

  const period = formatPeriod(lang, group.period_start, group.period_end)

  const showJournalTab = canViewLessons
  const currentTab = showJournalTab ? activeTab : 'overview'

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '9px 16px', fontSize: 13, fontWeight: active ? 600 : 500,
    color: active ? accent : '#6B7280',
    background: 'none', border: 'none', cursor: 'pointer',
    borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
    marginBottom: -1,
  })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: group.name },
      ]} />

      {/* Хедер */}
      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12,
        padding: '16px 24px',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{group.name}</h1>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
              {group.subject?.name && <span>{group.subject.name}</span>}
              {group.department?.name && <span> · {group.department.name}</span>}
              {!group.is_active && (
                <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 6, fontSize: 11 }}>
                  {t('class_groups.inactive_badge')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/education')}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: 'rgba(255,255,255,0.2)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {t('class_groups.back_to_list')}
          </button>
        </div>
      </div>

      {/* Табы */}
      {showJournalTab && (
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E7EB' }}>
          <button onClick={() => setActiveTab('overview')} style={tabBtn(currentTab === 'overview')}>
            {tJournal('tab_overview')}
          </button>
          <button onClick={() => setActiveTab('journal')} style={tabBtn(currentTab === 'journal')}>
            {tJournal('tab_journal')}
          </button>
        </div>
      )}

      {currentTab === 'overview' && (
        <>
          {/* Свод данных */}
          <div style={{
            background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
            padding: 20,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
          }}>
            <InfoCell label={t('class_groups.info_level')} value={group.level ?? '—'} />
            <InfoCell label={t('class_groups.info_period')} value={period ?? '—'} />
            <InfoCell label={t('class_groups.info_teachers')} value={String(group.teachers?.length ?? 0)} />
            <InfoCell label={t('class_groups.info_students')} value={String(group.students?.length ?? 0)} />
          </div>

          {/* Заметки */}
          {group.notes && (
            <div style={{
              background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
              padding: '12px 16px', fontSize: 13, color: '#92400E',
            }}>
              <strong style={{ marginRight: 6 }}>{t('class_groups.notes_prefix')}</strong>{group.notes}
            </div>
          )}

          {/* Преподаватели */}
          <ClassGroupTeachers
            groupId={group.id}
            departmentId={group.department?.id ?? null}
            teachers={group.teachers}
            onChange={load}
            accentColor={accent}
          />

          {/* Студенты */}
          <ClassGroupStudents
            groupId={group.id}
            groupDepartmentId={group.department?.id ?? null}
            students={group.students}
            onChange={load}
            accentColor={accent}
          />
        </>
      )}

      {currentTab === 'journal' && showJournalTab && (
        <LessonsJournalTab
          groupId={group.id}
          canManageLessons={canManageLessons}
          canMarkAttendance={canMarkAttendance}
          accentColor={accent}
        />
      )}
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
