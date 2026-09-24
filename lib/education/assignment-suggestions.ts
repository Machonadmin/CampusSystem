/**
 * Движок предложений по шибуцу кодеша (spec §3.5). «Система ПРЕДЛАГАЕТ, Chana
 * УТВЕРЖДАЕТ» — здесь только чистая логика предложения; окончательного авто-шибуца
 * нет нигде (предложения выходят со статусом 'suggested' и ждут подтверждения).
 *
 * Два режима:
 *   • continue_semester — продолжение того же уровня на семестр Б (тот же уровень
 *     и поток).
 *   • advance_year — переход на следующий уровень в начале года (уровень +1,
 *     поток сохраняется только на уровнях 1–2, дальше потоков нет).
 *
 * Уровень/поток берутся из текущего кодеш-назначения студентки (class_groups.
 * kodesh_level / kodesh_stream, Phase 1). Без текущего уровня → 'needs_placement'
 * (ручной шибуц, никогда не пустой без причины — spec §4.9).
 */

export type SuggestMode = 'continue_semester' | 'advance_year'
export type SuggestReason = 'continue' | 'advance' | 'graduated' | 'needs_placement'

export interface StudentPlacement {
  journeyId: string
  currentLevel: number | null
  currentStream: string | null
}

export interface Suggestion {
  journeyId: string
  suggestedLevel: number | null
  suggestedStream: string | null
  reason: SuggestReason
}

const MAX_LEVEL = 6

export function suggestKodeshPlacement(
  student: StudentPlacement,
  mode: SuggestMode,
  maxLevel: number = MAX_LEVEL,
): Suggestion {
  const { journeyId, currentLevel, currentStream } = student

  if (currentLevel === null || currentLevel < 1) {
    return { journeyId, suggestedLevel: null, suggestedStream: null, reason: 'needs_placement' }
  }

  if (mode === 'continue_semester') {
    return { journeyId, suggestedLevel: currentLevel, suggestedStream: currentStream, reason: 'continue' }
  }

  // advance_year
  if (currentLevel >= maxLevel) {
    // Уже на последнем уровне — «выпускается», предложения на следующий уровень нет.
    return { journeyId, suggestedLevel: currentLevel, suggestedStream: currentStream, reason: 'graduated' }
  }
  const nextLevel = currentLevel + 1
  // Поток есть только на уровнях 1–2; дальше — без потока.
  const nextStream = nextLevel <= 2 ? currentStream : null
  return { journeyId, suggestedLevel: nextLevel, suggestedStream: nextStream, reason: 'advance' }
}

export function suggestKodeshPlacements(
  students: StudentPlacement[],
  mode: SuggestMode,
  maxLevel: number = MAX_LEVEL,
): Suggestion[] {
  return students.map(s => suggestKodeshPlacement(s, mode, maxLevel))
}
