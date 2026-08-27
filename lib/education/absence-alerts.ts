import { createServerClient } from '@/lib/supabase/server'
import { createNotifications } from '@/lib/notifications/create'
import { fetchAllByIn, loadAbsenceCounts } from '@/lib/education/absence-counts'

type SB = ReturnType<typeof createServerClient>

/**
 * Ночной порог пропусков (הסלמת היעדרויות).
 *
 * Когда у активной студентки за окно ABSENCE_ALERT_DAYS накапливается
 * ABSENCE_ALERT_MIN пропусков (absent), сотрудники её подразделения получают
 * уведомление — чтобы никто не «выпал из радара», даже если доску «в зоне
 * риска» никто не открывал. Дедуп: одна студентка не уведомляется повторно, пока
 * её прошлое уведомление ещё в пределах окна (иначе оно капало бы каждую ночь).
 *
 * Возвращает число созданных уведомлений. Best-effort: не бросает (вызывается из
 * cron), при отсутствующих таблицах (42P01) отдаёт 0.
 */

// Порог сознательно выше, чем дефолт доски (min=3): доска — обзор, ночной
// сигнал — «пора действовать». Меняется здесь одной строкой.
export const ABSENCE_ALERT_DAYS = 30
export const ABSENCE_ALERT_MIN = 5

export async function materializeAbsenceThresholdAlerts(sb: SB): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - ABSENCE_ALERT_DAYS * 86400000).toISOString().slice(0, 10)

    // Пропуски по всему институту (deptIds=null), с учётом חריגות קודש.
    const counts = await loadAbsenceCounts(sb, { cutoff, deptIds: null })
    const candidateIds = [...counts.entries()]
      .filter(([, c]) => c.absent >= ABSENCE_ALERT_MIN)
      .map(([jid]) => jid)
    if (candidateIds.length === 0) return 0

    // Только активные студентки + имя + основное подразделение.
    const journeyRows = await fetchAllByIn<{
      id: string
      primary_department_id: string | null
      person: { full_name: string | null; hebrew_name: string | null } | null
    }>(
      sb, 'education_journeys',
      'id, primary_department_id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)',
      'id', candidateIds, ['id'],
      q => q.eq('education_status', 'student'),
    )
    if (journeyRows.length === 0) return 0

    // Дедуп: journey, уже уведомлённые в пределах окна, пропускаем. Одним
    // запросом собираем journey_id из metadata недавних 'absence_threshold'.
    const cutoffTs = new Date(Date.now() - ABSENCE_ALERT_DAYS * 86400000).toISOString()
    const alreadyNotified = new Set<string>()
    {
      const { data, error } = await sb
        .from('notifications')
        .select('metadata')
        .eq('type', 'absence_threshold')
        .gte('created_at', cutoffTs)
      if (error && error.code !== '42P01') throw error
      for (const r of (data ?? []) as Array<{ metadata: { journey_id?: string } | null }>) {
        const jid = r.metadata?.journey_id
        if (jid) alreadyNotified.add(jid)
      }
    }

    const pending = journeyRows.filter(j => !alreadyNotified.has(j.id))
    if (pending.length === 0) return 0

    // Получатели: активные сотрудники подразделения студентки.
    const deptIds = [...new Set(pending.map(j => j.primary_department_id).filter(Boolean))] as string[]
    const staffByDept = new Map<string, string[]>()
    if (deptIds.length > 0) {
      const staffRows = await fetchAllByIn<{ department_id: string; person_id: string }>(
        sb, 'staff_positions', 'department_id, person_id', 'department_id', deptIds, ['person_id'],
        q => q.is('end_date', null),
      )
      for (const s of staffRows) {
        const arr = staffByDept.get(s.department_id) ?? []
        if (!arr.includes(s.person_id)) arr.push(s.person_id)
        staffByDept.set(s.department_id, arr)
      }
    }

    let created = 0
    for (const j of pending) {
      const recipients = j.primary_department_id ? (staffByDept.get(j.primary_department_id) ?? []) : []
      if (recipients.length === 0) continue // некому — институтские менеджеры видят доску
      const c = counts.get(j.id)
      const name = (j.person?.hebrew_name || j.person?.full_name || '').trim() || '—'
      const absent = c?.absent ?? ABSENCE_ALERT_MIN
      await createNotifications(sb, recipients.map(pid => ({
        person_id: pid,
        type: 'absence_threshold',
        title: 'התראת היעדרויות',
        body: `${name} — ${absent} היעדרויות ב-${ABSENCE_ALERT_DAYS} הימים האחרונים`,
        link: '/dashboard/education/at-risk',
        metadata: { journey_id: j.id, absent_count: absent, threshold: ABSENCE_ALERT_MIN, days: ABSENCE_ALERT_DAYS },
      })))
      created += recipients.length
    }
    return created
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return 0
    console.error('[absence-alerts]', e)
    return 0
  }
}
