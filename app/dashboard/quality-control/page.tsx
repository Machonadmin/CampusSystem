'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import CreateCheckModal from './components/CreateCheckModal'

interface CheckRow {
  id: string
  lesson_date: string
  lesson_time: string
  teacher_person_id: string
  teacher_name: string | null
  observer_person_id: string
  observer_name: string | null
  group_name: string | null
  course_name: string | null
  template_name: string | null
  status: string
  overall_rating: number | null
  completed_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'Запланировано',
  in_progress: 'В процессе',
  completed: 'Завершено',
}
const STATUS_COLOR: Record<string, [string, string]> = {
  planned:     ['#EFF6FF', '#3B82F6'],
  in_progress: ['#FFFBEB', '#D97706'],
  completed:   ['#F0FDF4', '#16A34A'],
}

function StatusBadge({ status }: { status: string }) {
  const [bg, color] = STATUS_COLOR[status] ?? ['#F3F4F6', '#6B7280']
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: bg, color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
  return (
    <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 700 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
      <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 11, marginLeft: 4 }}>{rating}/5</span>
    </span>
  )
}

export default function QualityControlPage() {
  const [tab, setTab] = useState<'planned' | 'history'>('planned')
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/quality-control?${params}`)
      if (res.ok) setChecks(await res.json())
    } finally {
      setLoading(false)
    }
  }, [tab, search, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string, date: string) {
    if (!confirm(`Удалить проверку от ${date}?`)) return
    setDeletingId(id)
    try {
      await fetch(`/api/quality-control/${id}`, { method: 'DELETE' })
      setRefresh(r => r + 1)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleChangeStatus(id: string, status: string) {
    await fetch(`/api/quality-control/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setRefresh(r => r + 1)
  }

  function formatDate(d: string) {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return d }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Контроль качества' },
      ]} />

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div
          className="flex items-center rounded-xl overflow-hidden flex-1"
          style={{ backgroundColor: '#BE185D', borderLeft: '4px solid #EC4899', padding: '12px 24px', minWidth: 200 }}
        >
          <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Контроль качества преподавания</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, backgroundColor: '#BE185D', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
        >
          + Новая проверка
        </button>
      </div>

      {/* Tabs + toolbar */}
      <div style={{ backgroundColor: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        {/* Tab strip */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB' }}>
          {(['planned', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '11px 20px', fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? '#BE185D' : '#6B7280',
                borderBottom: tab === t ? '2px solid #BE185D' : '2px solid transparent',
                background: 'none', border: 'none', borderBottomStyle: 'solid',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
            >
              {t === 'planned' ? 'Запланированные' : 'История проверок'}
            </button>
          ))}
        </div>

        {/* Search toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', backgroundColor: '#FAFAFA' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по группе или курсу..."
            style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #E5E7EB', borderRadius: 6, outline: 'none', width: 280 }}
          />
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка...</div>
          ) : checks.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              {tab === 'planned' ? 'Нет запланированных проверок' : 'История проверок пуста'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  {['Дата / Время', 'Преподаватель', 'Группа / Курс', 'Наблюдатель', 'Статус', 'Оценка', 'Действия'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={c.id} style={{ borderTop: '1px solid #F3F4F6', backgroundColor: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{formatDate(c.lesson_date)}</div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{c.lesson_time.slice(0, 5)}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, color: '#374151' }}>{c.teacher_name ?? '—'}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {c.group_name && <div style={{ fontSize: 13, color: '#374151' }}>{c.group_name}</div>}
                      {c.course_name && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{c.course_name}</div>}
                      {!c.group_name && !c.course_name && <span style={{ color: '#D1D5DB', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, color: '#374151' }}>{c.observer_name ?? '—'}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <RatingStars rating={c.overall_rating} />
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {c.status === 'planned' && (
                          <button
                            onClick={() => handleChangeStatus(c.id, 'in_progress')}
                            style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #FDE68A', borderRadius: 5, background: '#FFFBEB', cursor: 'pointer', color: '#92400E', fontWeight: 600 }}
                          >
                            Начать
                          </button>
                        )}
                        {c.status === 'in_progress' && (
                          <button
                            onClick={() => handleChangeStatus(c.id, 'completed')}
                            style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #86EFAC', borderRadius: 5, background: '#F0FDF4', cursor: 'pointer', color: '#166534', fontWeight: 600 }}
                          >
                            Завершить
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(c.id, formatDate(c.lesson_date))}
                          disabled={deletingId === c.id}
                          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #FEE2E2', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', color: '#DC2626', fontWeight: 600, opacity: deletingId === c.id ? 0.5 : 1 }}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateCheckModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setRefresh(r => r + 1) }}
        />
      )}
    </div>
  )
}
