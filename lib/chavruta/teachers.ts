import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * «Моры хавруты» — кому по средам приходит напоминание и кто может записывать
 * хавруту. Список = преподаватели КОДЕША (class_teachers групп кафедры кодеша)
 * ∪ вручную добавленные менеджером (таблица chavruta_teachers).
 * Деплой-безопасно: нет chavruta_teachers (42P01) → только кодеш-учителя.
 */
type SB = ReturnType<typeof createServerClient>
function u(sb: SB) { return sb as unknown as SupabaseClient }

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
    const { data, error } = await u(sb).from('chavruta_teachers').select('person_id')
    if (error) throw error
    return (data ?? []).map((r: { person_id: string }) => r.person_id)
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return []
    throw e
  }
}

/** Итоговое множество мор хавруты (кодеш ∪ ручные). */
export async function effectiveChavrutaTeacherIds(sb: SB): Promise<Set<string>> {
  const [kodesh, manual] = await Promise.all([kodeshTeacherIds(sb), manualChavrutaTeacherIds(sb)])
  return new Set([...kodesh, ...manual])
}

/** Является ли person морой хавруты (для гейта записи сессии). */
export async function isChavrutaTeacher(sb: SB, personId: string): Promise<boolean> {
  const set = await effectiveChavrutaTeacherIds(sb)
  return set.has(personId)
}
