'use client'

import Link from 'next/link'
import { useApiResource } from '@/lib/hooks/useApiResource'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { countOpenItems, type StudentOpenItems } from '@/lib/students/open-items'

/**
 * «פתוח עכשיו» — верх карточки תלמידה: всё незакрытое по ней в одном месте
 * (оповещения, случаи отсутствия, задачи с меткой этой תלמידה). Каждая строка
 * ведёт на свой экран. Что смотрящему не положено — сервер просто не отдаёт
 * (пустой раздел), поэтому здесь ничего дополнительно не прячется.
 */

type Kind = 'alert' | 'absence' | 'task'

const KIND_STYLE: Record<Kind, { bg: string; fg: string }> = {
  alert:   { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
  absence: { bg: 'var(--warn-tint)',   fg: 'var(--warn)' },
  task:    { bg: 'var(--info-tint)',   fg: 'var(--info)' },
}

interface Item { key: string; kind: Kind; title: string; meta: string; href: string }

export default function StudentOpenItemsPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('student_overview')
  const tAlerts = useTranslations('education.alerts')
  const tAbs = useTranslations('education.absences')
  const tTasks = useTranslations('tasks')
  const { lang } = useLang()

  const { data, loading, error } = useApiResource<StudentOpenItems>(
    `/api/students/${journeyId}/open-items`,
    t('open_now_error'),
  )

  if (loading && !data) return null

  const items: Item[] = []
  if (data) {
    const alertsHref = data.person_id
      ? `/dashboard/education/alerts?student=${encodeURIComponent(data.person_id)}`
      : '/dashboard/education/alerts'
    for (const a of data.alerts ?? []) {
      const typeName = (lang === 'he' ? a.type_name_he : lang === 'en' ? a.type_name_en : a.type_name_ru) || a.type_name_ru || a.type_code
      items.push({
        key: `a:${a.id}`,
        kind: 'alert',
        title: a.title || typeName || t('open_now_type_alert'),
        meta: [
          a.title && typeName ? typeName : null,
          tAlerts(`severity_${a.severity}`, a.severity),
          tAlerts(`state_${a.state}`, a.state),
          formatDate(a.created_at.slice(0, 10), lang),
        ].filter(Boolean).join(' · '),
        href: alertsHref,
      })
    }
    for (const c of data.absence_cases ?? []) {
      items.push({
        key: `c:${c.id}`,
        kind: 'absence',
        title: c.absence_date
          ? `${t('open_now_type_absence')} · ${formatDate(c.absence_date, lang)}`
          : (c.note || t('open_now_type_absence')),
        meta: [
          tAbs(`status_${c.status}`, c.status),
          c.department_name ? `${tAbs('at_dept')} ${c.department_name}` : null,
          c.absence_date ? c.note : null,
        ].filter(Boolean).join(' · '),
        href: '/dashboard/education/absences',
      })
    }
    for (const tk of data.tasks ?? []) {
      items.push({
        key: `t:${tk.id}`,
        kind: 'task',
        title: tk.title,
        meta: [
          tTasks(`status.${tk.status}`, tk.status),
          tk.due_date ? `${tTasks('card.due_prefix')} ${formatDate(tk.due_date, lang)}` : null,
          tk.assignee_name,
        ].filter(Boolean).join(' · '),
        href: `/dashboard/tasks/${tk.id}`,
      })
    }
  }

  const total = countOpenItems(data)
  const kindLabel: Record<Kind, string> = {
    alert: t('open_now_type_alert'),
    absence: t('open_now_type_absence'),
    task: t('open_now_type_task'),
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: items.length || error ? 10 : 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('open_now_title')}</span>
        {total > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 9px', borderRadius: 999, background: 'var(--accent-strong)', color: '#fff' }}>{total}</span>
        )}
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('open_now_empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => (
            <Link
              key={it.key}
              href={it.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                background: KIND_STYLE[it.kind].bg, color: KIND_STYLE[it.kind].fg,
              }}>
                {kindLabel[it.kind]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.title}
                </span>
                {it.meta && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.meta}
                  </span>
                )}
              </span>
              <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--accent-strong)' }}>{t('open_now_open')} ‹</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
