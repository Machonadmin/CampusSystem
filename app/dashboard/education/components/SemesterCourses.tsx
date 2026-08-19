'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import CourseModal from './CourseModal'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// Курсы внутри семестра. Курс = class_group (parent_semester_id = семестр);
// его уроки/расписание/оценки живут на существующей карточке класс-группы.

interface Course {
  id: string
  name: string
  subject: { id: string; name: string; name_he?: string | null } | null
  counts: { teachers: number; students: number }
}
interface RosterStudent { journey_id: string; full_name: string | null }

const accent = getModuleColor('education')
const ICON_COURSE = 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'

export default function SemesterCourses({ semesterId, semesterName }: { semesterId: string; semesterName: string }) {
  const t = useTranslations('education.study')
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cResp, dResp] = await Promise.all([
        fetch(`/api/education/semester-groups/${semesterId}/courses`),
        fetch(`/api/education/semester-groups/${semesterId}`),
      ])
      const cJson = cResp.ok ? await cResp.json() : { courses: [] }
      setCourses(cJson.courses ?? [])
      if (dResp.ok) {
        const d = await dResp.json()
        setRoster((d.students ?? []).map((s: { journey_id: string; full_name: string | null }) => ({ journey_id: s.journey_id, full_name: s.full_name })))
      }
    } finally {
      setLoading(false)
    }
  }, [semesterId])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{semesterName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('courses.title')}</div>
        </div>
        <PageActionButton label={t('courses.add_button')} onClick={() => setModalOpen(true)} accentColor={accent} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('common.loading')}</div>
      ) : courses.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('courses.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {courses.map(c => (
            <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 15px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={ICON_COURSE} /></svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {[t('courses.count_teachers').replace('{n}', String(c.counts.teachers)), t('workspace.count_students').replace('{n}', String(c.counts.students))].join(' · ')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/education/class-groups/${c.id}`)}
                style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('courses.open')}
              </button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CourseModal
          semesterId={semesterId}
          roster={roster}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </div>
  )
}
