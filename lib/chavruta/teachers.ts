import { createServerClient } from '@/lib/supabase/server'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * «Моры хавруты» — кому по средам приходит напоминание и кто может записывать
 * хавруту. Список = преподаватели КОДЕША (class_teachers групп кафедры кодеша)
 * ∪ вручную добавленные менеджером (таблица chavruta_teachers),
 * скорректированный персональными оверрайдами person_privileges
 * (module='chavruta', privilege_code='access'): grant добавляет, deny убирает —
 * deny сильнее автоправила «кодеш-учитель», иначе его никак не выключить.
 * Деплой-безопасно: нет chavruta_teachers (42P01) → только кодеш-учителя.
 */
type SB = ReturnType<typeof createServerClient>

/** person_id всех кодеш-преподавателей (по активным группам кафедры кодеша). */
async function kodeshTeacherIds(sb: SB): Promise<string[]> {
  try {
    const { data: groups, error: gErr } = await sb
      .from('class_groups').select('id').eq('department_id', KODESH_DEPT_ID)
    if (gErr) throw gErr
    const groupIds = (groups ?? []).map(g => g.id)
    if (groupIds.length === 0) return []
    const { data: ct, error: cErr } = await sb
      .from('class_teachers').select('teacher_id').in('class_group_id', groupIds)
    if (cErr) throw cErr
    return [...new Set((ct ?? []).map(r => r.teacher_id as string))]
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return []
    throw e
  }
}

/** Ручные добавления менеджера. */
async function manualChavrutaTeacherIds(sb: SB): Promise<string[]> {
  try {
    const { data, error } = await sb.from('chavruta_teachers').select('person_id')
    if (error) throw error
    return (data ?? []).map((r: { person_id: string }) => r.person_id)
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return []
    throw e
  }
}

/** Персональные оверрайды доступа к хавруте (не истёкшие). */
async function chavrutaOverrides(sb: SB): Promise<{ granted: string[]; denied: string[] }> {
  try {
    const { data, error } = await sb
      .from('person_privileges')
      .select('person_id, is_granted, expires_at')
      .eq('module', 'chavruta')
      .eq('privilege_code', 'access')
    if (error) throw error
    const nowMs = Date.now()
    const granted: string[] = []
    const denied: string[] = []
    for (const r of (data ?? []) as Array<{ person_id: string; is_granted: boolean; expires_at: string | null }>) {
      if (r.expires_at && new Date(r.expires_at).getTime() <= nowMs) continue
      if (r.is_granted) granted.push(r.person_id)
      else denied.push(r.person_id)
    }
    return { granted, denied }
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return { granted: [], denied: [] }
    throw e
  }
}

/** Итоговое множество мор хавруты ((кодеш ∪ ручные ∪ grant) − deny). */
export async function effectiveChavrutaTeacherIds(sb: SB): Promise<Set<string>> {
  const [kodesh, manual, overrides] = await Promise.all([
    kodeshTeacherIds(sb), manualChavrutaTeacherIds(sb), chavrutaOverrides(sb),
  ])
  const set = new Set([...kodesh, ...manual, ...overrides.granted])
  for (const id of overrides.denied) set.delete(id)
  return set
}

/** Является ли person морой хавруты (для гейта записи сессии). */
export async function isChavrutaTeacher(sb: SB, personId: string): Promise<boolean> {
  const set = await effectiveChavrutaTeacherIds(sb)
  return set.has(personId)
}
