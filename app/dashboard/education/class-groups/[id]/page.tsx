'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import ClassGroupTeachers from '@/app/dashboard/education/components/ClassGroupTeachers'
import ClassGroupStudents from '@/app/dashboard/education/components/ClassGroupStudents'

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

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`
  }
  if (start && end) return `${fmt(start)} — ${fmt(end)}`
  if (start) return `с ${fmt(start)}`
  return `до ${fmt(end!)}`
}

export default function ClassGroupCardPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const groupId = params.id

  const [group, setGroup] = useState<ClassGroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}`)
      if (!resp.ok) {
        if (resp.status === 404) {
          setError('Учебная группа не найдена')
          setLoading(false)
          return
        }
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? `Ошибка ${resp.status}`)
      }
      const data = await resp.json()
      setGroup(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  const accent = getModuleColor('education')

  if (loading) {
    return (
      <div className="p-6">
        <div style={{ color: '#6B7280', textAlign: 'center', padding: 48 }}>Загрузка…</div>
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumb items={[
          { label: 'Главная', href: '/dashboard' },
          { label: 'Образование', href: '/dashboard/education' },
          { label: 'Карточка группы' },
        ]} />
        <div style={{
          padding: 24, background: '#FEE2E2', color: '#991B1B',
          borderRadius: 8, fontSize: 14,
        }}>
          {error ?? 'Группа не найдена'}
        </div>
        <button
          onClick={() => router.push('/dashboard/education')}
          style={{
            padding: '8px 16px', fontSize: 13, color: '#374151',
            background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer',
          }}
        >
          ← К списку
        </button>
      </div>
    )
  }

  const period = formatPeriod(group.period_start, group.period_end)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование', href: '/dashboard/education' },
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
                  Неактивна
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
            ← К списку
          </button>
        </div>
      </div>

      {/* Свод данных */}
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
        padding: 20,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
      }}>
        <InfoCell label="Уровень" value={group.level ?? '—'} />
        <InfoCell label="Период обучения" value={period ?? '—'} />
        <InfoCell label="Преподавателей" value={String(group.teachers?.length ?? 0)} />
        <InfoCell label="Студентов" value={String(group.students?.length ?? 0)} />
      </div>

      {/* Заметки */}
      {group.notes && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: '12px 16px', fontSize: 13, color: '#92400E',
        }}>
          <strong style={{ marginRight: 6 }}>Заметки:</strong>{group.notes}
        </div>
      )}

      {/* Преподаватели */}
      <ClassGroupTeachers
        groupId={group.id}
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
