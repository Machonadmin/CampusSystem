import type { createServerClient } from '@/lib/supabase/server'
import { findPersonsByContact, findPersonsByName } from '@/lib/persons/contact-match'
import { fillEmptyPersonFields, type IncomingPersonFields } from '@/lib/persons/merge-fill'

/**
 * Общий поток регистрации лида для публичной формы сайта и формы сотрудницы
 * (решение владельца 24.09.2026):
 *
 *   • ровно ОДНО совпадение по телефону/email → вливаем в существующую
 *     карточку: дозаполняем пустые поля; дальше по её journey:
 *       – открытый 'lead'/'applicant' → переиспользуем (без нового journey и
 *         без нового процесса), добавляем новые направления, пишем заметку;
 *       – открытый с другим статусом (student …) → только заметка;
 *       – только закрытые/нет → create_application с person_id (новый лид),
 *         дальше обычный поток (start_process и т.п. — в роуте).
 *   • НЕСКОЛЬКО совпадений по контакту → не угадываем: новая персона +
 *     пометка «возможный дубль».
 *   • нет совпадения по контакту, но есть по имени → новая персона + пометка.
 *
 * Пометка «возможный дубль» — без миграции: заметка в ленте journey
 * (process_events, event_type='note'); если подэтапов нет — строка в
 * education_journeys.notes. Специфичные части (общины, задачи пула גיוס,
 * ответ клиенту) остаются в роутах.
 */

type Sb = ReturnType<typeof createServerClient>

export interface LeadInterestInput {
  direction_id?: string | null
  level_id?: string | null
  free_text?: string | null
}

export interface CreateOrMergeLeadInput {
  /** payload для RPC create_application (без person_id) — как раньше в роуте. */
  payload: Record<string, unknown>
  /** Данные персоны из заявки — для поиска совпадений и дозаполнения. */
  incoming: IncomingPersonFields
  interests: LeadInterestInput[]
  actorId: string
  /** Источник для заметки на иврите: «טופס באתר» / «הוזנה ע״י צוות». */
  sourceLabel: string
  comment?: string | null
}

export interface CreateOrMergeLeadResult {
  personId: string
  journeyId: string
  /** Заявка влита в существующую карточку (совпадение по телефону/email). */
  merged: boolean
  /** true → создан НОВЫЙ journey: роут запускает процесс и прочий обычный поток. */
  newJourney: boolean
  filled: string[]
  /** Кандидаты-дубли (для заметки после start_process). */
  possibleDuplicateIds: string[]
  /** Заметка о слиянии, которую нужно записать ПОСЛЕ start_process (новый journey). */
  pendingMergeNote: string | null
}

export interface JourneyLite {
  id: string
  education_status: string | null
  closed_at: string | null
  is_deleted: boolean | null
  created_at: string
}

export type JourneyDecision =
  | { action: 'reuse'; journey: JourneyLite }
  | { action: 'note_only'; journey: JourneyLite }
  | { action: 'create' }
  | { action: 'blocked' }

/** Подписи полей для заметки (иврит — язык рабочей ленты). */
const FIELD_LABELS_HE: Record<string, string> = {
  first_name: 'שם פרטי',
  last_name: 'שם משפחה',
  middle_name: 'שם אמצעי',
  hebrew_name: 'שם עברי',
  email: 'אימייל',
  gender: 'מגדר',
  birth_date: 'תאריך לידה',
  address: 'כתובת',
  marital_status: 'מצב משפחתי',
  nationality: 'אזרחות',
  passport_number: 'מספר דרכון',
  phones: 'טלפון',
}

/**
 * Чистое решение по journey найденной персоны. Удалённые (is_deleted) не
 * считаются. Открытый удалённый journey = 'blocked': RPC create_application
 * ищет открытый journey без учёта is_deleted и переиспользовал бы удалённый.
 */
export function decideJourney(journeys: JourneyLite[]): JourneyDecision {
  const open = journeys
    .filter(j => !j.closed_at && !j.is_deleted)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const recruiting = open.find(j => j.education_status === 'lead' || j.education_status === 'applicant')
  if (recruiting) return { action: 'reuse', journey: recruiting }
  if (open.length > 0) return { action: 'note_only', journey: open[0] }
  if (journeys.some(j => !j.closed_at && j.is_deleted)) return { action: 'blocked' }
  return { action: 'create' }
}

/** Чистый текст заметки о повторной регистрации. */
export function buildMergeNote(sourceLabel: string, date: string, filled: string[], comment?: string | null): string {
  const fields = filled.length > 0 ? filled.map(f => FIELD_LABELS_HE[f] ?? f).join(', ') : '—'
  const head = `נרשמה שוב (${sourceLabel}), ${date}. הושלמו: ${fields}`
  return comment?.trim() ? `${head}\n${comment.trim()}` : head
}

/** Чистый текст пометки «возможный дубль». */
export function buildDuplicateNote(persons: { id: string; full_name: string | null }[]): string {
  return `ייתכן כפילות עם: ${persons.map(p => `${p.full_name || '—'} (/dashboard/persons/${p.id})`).join('; ')}`
}

/** Чистый фильтр: направления/свободный текст, которых у персоны ещё нет. */
export function newInterests(existing: LeadInterestInput[], incoming: LeadInterestInput[]): LeadInterestInput[] {
  const key = (i: LeadInterestInput) => i.direction_id
    ? `d:${i.direction_id}:${i.level_id ?? ''}`
    : `t:${(i.free_text ?? '').trim().toLowerCase()}`
  const seen = new Set(existing.map(key))
  const out: LeadInterestInput[] = []
  for (const i of incoming) {
    if (!i.direction_id && !i.free_text?.trim()) continue
    const k = key(i)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(i)
  }
  return out
}

function todayHe(): string {
  return new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
}

/** Активный подэтап активного процесса journey → иначе самый свежий (как в communications). */
async function targetStageId(sb: Sb, journeyId: string): Promise<string | null> {
  const { data: pis } = await sb
    .from('process_instances')
    .select('id, status')
    .eq('journey_id', journeyId)
  const procIds = (pis ?? []).map(p => p.id as string)
  if (procIds.length === 0) return null
  const { data: stages } = await sb
    .from('stage_instances')
    .select('id, status, process_instance_id, created_at')
    .in('process_instance_id', procIds)
    .order('created_at', { ascending: false })
  const list = (stages ?? []) as Array<{ id: string; status: string; process_instance_id: string }>
  const activeProc = new Set((pis ?? []).filter(p => p.status === 'active').map(p => p.id as string))
  return list.find(s => s.status === 'active' && activeProc.has(s.process_instance_id))?.id
    ?? list[0]?.id ?? null
}

/**
 * Заметка в ленту journey: process_events на подэтапе; если подэтапов нет —
 * дописываем строку в education_journeys.notes. Best-effort (не валит заявку).
 */
export async function writeJourneyNote(
  sb: Sb, journeyId: string, content: string, authorId: string, metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const stageId = await targetStageId(sb, journeyId)
    if (stageId) {
      const { error } = await sb.from('process_events').insert({
        stage_instance_id: stageId,
        event_type: 'note',
        content,
        author_id: authorId,
        metadata,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      if (error) console.error('[create-or-merge-lead] note:', error)
      return
    }
    const { data: j, error: readErr } = await sb
      .from('education_journeys')
      .select('notes')
      .eq('id', journeyId)
      .maybeSingle()
    if (readErr) throw readErr
    const notes = [(j as { notes: string | null } | null)?.notes?.trim(), content].filter(Boolean).join('\n')
    const { error: updErr } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ notes } as any)
      .eq('id', journeyId)
    if (updErr) console.error('[create-or-merge-lead] journey notes:', updErr)
  } catch (err) {
    console.error('[create-or-merge-lead] note:', err)
  }
}

/** Новая персона + новый лид — как было до решения о слиянии. */
async function createNew(sb: Sb, input: CreateOrMergeLeadInput, possibleDuplicateIds: string[]): Promise<CreateOrMergeLeadResult> {
  const { data, error } = await sb.rpc('create_application', { payload: { ...input.payload, person_id: null } })
  if (error) throw error
  const { person_id: personId, journey_id: journeyId } = data as { person_id: string; journey_id: string }
  return {
    personId, journeyId, merged: false, newJourney: true, filled: [],
    possibleDuplicateIds: possibleDuplicateIds.filter(id => id !== personId),
    pendingMergeNote: null,
  }
}

export async function createOrMergeLead(sb: Sb, input: CreateOrMergeLeadInput): Promise<CreateOrMergeLeadResult> {
  // 1. Поиск по контактам. Ошибка поиска не должна терять заявку — тогда
  //    просто создаём как раньше.
  let contactIds: string[] = []
  try {
    contactIds = await findPersonsByContact(sb, {
      phones: input.incoming.phones ?? [],
      email: input.incoming.email ?? null,
    })
  } catch (err) {
    console.error('[create-or-merge-lead] contact match:', err)
  }

  // 2. Несколько совпадений — не угадываем, помечаем для сотрудниц.
  if (contactIds.length > 1) return createNew(sb, input, contactIds)

  // 3. Нет совпадения по контакту — проверяем имя (только пометка).
  if (contactIds.length === 0) {
    let nameIds: string[] = []
    try {
      nameIds = await findPersonsByName(sb, input.incoming.first_name, input.incoming.last_name)
    } catch (err) {
      console.error('[create-or-merge-lead] name match:', err)
    }
    return createNew(sb, input, nameIds)
  }

  // 4. Ровно одно совпадение — вливаем в существующую карточку.
  const personId = contactIds[0]
  const { data: jRows, error: jErr } = await sb
    .from('education_journeys')
    .select('id, education_status, closed_at, is_deleted, created_at')
    .eq('person_id', personId)
  if (jErr) throw jErr
  const decision = decideJourney((jRows ?? []) as JourneyLite[])

  // Открытый, но удалённый journey: RPC переиспользовал бы его — безопаснее
  // создать новую персону и пометить дубль, чем «потерять» заявку в удалённой.
  if (decision.action === 'blocked') return createNew(sb, input, [personId])

  let filled: string[] = []
  try {
    filled = await fillEmptyPersonFields(sb, personId, input.incoming)
  } catch (err) {
    console.error('[create-or-merge-lead] fill person:', err)
  }
  const note = buildMergeNote(input.sourceLabel, todayHe(), filled, input.comment)
  const meta = { kind: 'contact_merge', filled }

  if (decision.action === 'create') {
    const { data, error } = await sb.rpc('create_application', { payload: { ...input.payload, person_id: personId } })
    if (error) throw error
    const { journey_id: journeyId } = data as { person_id: string; journey_id: string }
    return { personId, journeyId, merged: true, newJourney: true, filled, possibleDuplicateIds: [], pendingMergeNote: note }
  }

  const journeyId = decision.journey.id
  if (decision.action === 'reuse') {
    // Направления хранятся на уровне персоны — добавляем только новые.
    try {
      const { data: existing, error: liErr } = await sb
        .from('lead_interests')
        .select('direction_id, level_id, free_text')
        .eq('person_id', personId)
      if (liErr) throw liErr
      const toAdd = newInterests((existing ?? []) as LeadInterestInput[], input.interests)
      if (toAdd.length > 0) {
        const { error: insErr } = await sb.from('lead_interests').insert(toAdd.map(i => ({
          person_id: personId,
          direction_id: i.direction_id ?? null,
          level_id: i.direction_id ? (i.level_id ?? null) : null,
          free_text: i.direction_id ? null : (i.free_text?.trim() || null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any)
        if (insErr) console.error('[create-or-merge-lead] lead_interests:', insErr)
      }
    } catch (err) {
      console.error('[create-or-merge-lead] lead_interests:', err)
    }
  }
  await writeJourneyNote(sb, journeyId, note, input.actorId, meta)
  return { personId, journeyId, merged: true, newJourney: false, filled, possibleDuplicateIds: [], pendingMergeNote: null }
}

/**
 * Заметки, которые пишутся ПОСЛЕ start_process нового journey (чтобы попасть
 * на подэтап процесса): о слиянии и/или о возможном дубле.
 */
export async function writePostStartNotes(sb: Sb, result: CreateOrMergeLeadResult, actorId: string): Promise<void> {
  if (!result.newJourney) return
  if (result.pendingMergeNote) {
    await writeJourneyNote(sb, result.journeyId, result.pendingMergeNote, actorId, { kind: 'contact_merge', filled: result.filled })
  }
  if (result.possibleDuplicateIds.length > 0) {
    try {
      const { data, error } = await sb
        .from('persons')
        .select('id, full_name')
        .in('id', result.possibleDuplicateIds)
      if (error) throw error
      const persons = (data ?? []) as { id: string; full_name: string | null }[]
      if (persons.length > 0) {
        await writeJourneyNote(sb, result.journeyId, buildDuplicateNote(persons), actorId, {
          kind: 'possible_duplicate', person_ids: persons.map(p => p.id),
        })
      }
    } catch (err) {
      console.error('[create-or-merge-lead] duplicate note:', err)
    }
  }
}
