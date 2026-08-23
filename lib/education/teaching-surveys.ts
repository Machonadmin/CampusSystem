import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

// ─── Доступ к сущностям «הערכת הוראה» (таблиц нет в сгенерированных типах) ─────
export function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export interface SurveyQuestion { id: string; text: string; kind: 'rating' | 'text'; position: number }
export interface Survey { id: string; title: string; is_open: boolean; created_at: string }

/** Сбор + его вопросы (по порядку). null — если сбора нет. deploy-safe снаружи. */
export async function getSurveyWithQuestions(
  sb: ReturnType<typeof createServerClient>, id: string,
): Promise<{ survey: Survey; questions: SurveyQuestion[] } | null> {
  const { data: s } = await u(sb).from('teaching_surveys').select('id, title, is_open, created_at').eq('id', id).maybeSingle()
  if (!s) return null
  const { data: q } = await u(sb).from('teaching_survey_questions')
    .select('id, text, kind, position').eq('survey_id', id).order('position', { ascending: true })
  return { survey: s as Survey, questions: (q ?? []) as SurveyQuestion[] }
}

/** Преподаватели учебных групп ученицы (по её journey). С именами. */
export async function resolveStudentTeachers(
  sb: ReturnType<typeof createServerClient>, journeyId: string,
): Promise<Array<{ person_id: string; name: string }>> {
  const { data: enr } = await sb.from('class_enrollments').select('class_group_id').eq('journey_id', journeyId)
  const groupIds = [...new Set((enr ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
  if (groupIds.length === 0) return []
  const { data: ct } = await sb.from('class_teachers').select('teacher_id').in('class_group_id', groupIds)
  const teacherIds = [...new Set((ct ?? []).map(r => (r as { teacher_id: string }).teacher_id))]
  if (teacherIds.length === 0) return []
  return namesFor(sb, teacherIds)
}

export interface SubmitAnswer { question_id: string; rating?: number | null; text_value?: string | null }

/**
 * Отклик респондента на сбор по одному преподавателю. Идемпотентно: повторная
 * отправка заменяет прошлый отклик того же респондента о том же преподавателе.
 * Возвращает { code } при отказе (survey_closed / invalid_reference / not_found).
 */
export async function submitResponse(
  sb: ReturnType<typeof createServerClient>,
  args: { surveyId: string; teacherPersonId: string; respondentPersonId: string; role: 'student' | 'manager'; answers: SubmitAnswer[] },
): Promise<{ ok: true } | { code: string }> {
  const { data: survey } = await u(sb).from('teaching_surveys').select('id, is_open').eq('id', args.surveyId).maybeSingle()
  if (!survey) return { code: 'not_found' }
  if (!(survey as { is_open: boolean }).is_open) return { code: 'survey_closed' }
  if (!args.teacherPersonId) return { code: 'invalid_reference' }

  const { data: qs } = await u(sb).from('teaching_survey_questions').select('id, kind').eq('survey_id', args.surveyId)
  const qById = new Map((qs ?? []).map(q => [(q as { id: string }).id, (q as { kind: string }).kind]))

  // upsert отклика
  const { data: existing } = await u(sb).from('teaching_survey_responses')
    .select('id').eq('survey_id', args.surveyId).eq('teacher_person_id', args.teacherPersonId).eq('respondent_person_id', args.respondentPersonId).maybeSingle()
  let responseId: string
  if (existing) {
    responseId = (existing as { id: string }).id
    await u(sb).from('teaching_survey_answers').delete().eq('response_id', responseId)
    await u(sb).from('teaching_survey_responses').update({ respondent_role: args.role, submitted_at: new Date().toISOString() }).eq('id', responseId)
  } else {
    const { data: created, error } = await u(sb).from('teaching_survey_responses')
      .insert({ survey_id: args.surveyId, teacher_person_id: args.teacherPersonId, respondent_person_id: args.respondentPersonId, respondent_role: args.role })
      .select('id').single()
    if (error || !created) return { code: 'invalid_reference' }
    responseId = (created as { id: string }).id
  }

  const rows = args.answers
    .filter(a => qById.has(a.question_id))
    .map(a => {
      const kind = qById.get(a.question_id)
      if (kind === 'rating') {
        const r = Number(a.rating)
        return { response_id: responseId, question_id: a.question_id, rating: Number.isInteger(r) && r >= 1 && r <= 5 ? r : null, text_value: null }
      }
      return { response_id: responseId, question_id: a.question_id, rating: null, text_value: (a.text_value ?? '').trim() || null }
    })
  if (rows.length) await u(sb).from('teaching_survey_answers').insert(rows)
  return { ok: true }
}

/** id → имя (persons.full_name || hebrew_name), только непустые, отсортировано. */
export async function namesFor(
  sb: ReturnType<typeof createServerClient>, ids: string[],
): Promise<Array<{ person_id: string; name: string }>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return []
  const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', uniq)
  return (data ?? [])
    .map(p => {
      const r = p as { id: string; full_name: string | null; hebrew_name: string | null }
      return { person_id: r.id, name: (r.hebrew_name || r.full_name || '').trim() }
    })
    .filter(x => x.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
}
