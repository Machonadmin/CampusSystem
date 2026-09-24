'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import type { TaskStudentRef } from '@/lib/tasks/student-tag'

/**
 * Чип «תלמידה קשורה» на задаче — имя תלמידה, к которой привязана задача
 * (metadata.student_person_id + journey_id, имя добавляет API задач).
 * Намеренно НЕ ссылка: карточка задачи сама кликабельна, а карточку תלמידה
 * смотрящий может и не иметь права открыть.
 */
export default function StudentChip({ student }: { student: TaskStudentRef | null | undefined }) {
  const t = useTranslations('tasks')
  if (!student) return null
  const name = student.name || '—'
  return (
    <span
      title={`${t('card.student_label')}: ${name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 200,
        padding: '1px 8px', fontSize: 11, fontWeight: 600,
        background: 'var(--accent-tint)', color: 'var(--accent-strong)', borderRadius: 8,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      🎓 {name}
    </span>
  )
}
