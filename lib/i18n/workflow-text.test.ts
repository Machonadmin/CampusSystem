import { describe, it, expect } from 'vitest'
import { translateSystemEvent } from './workflow-text'

// Системные события пишет PL/pgSQL по-русски; переводим ПРИ ПОКАЗЕ по шаблонам.
// Незнакомая строка обязана вернуться как есть — иначе лента событий теряет текст.
const t = (key: string, fallback?: string) => {
  const dict: Record<string, string> = {
    'system.substage_completed': 'שלב הושלם',
    'system.substage_cancelled': 'שלב בוטל',
    'system.substage_activated': 'שלב הופעל',
    'system.process_started': 'תהליך הופעל',
    'system.substage_activated_manually': 'השלב הופעל ידנית',
    'system.substage_reopened': 'השלב נפתח מחדש לשינוי החלטה',
    'system.substage_activated_dormitory': 'השלב הופעל (נדרשת פנימייה)',
    'system.dormitory_stage_restored': 'שלב הפנימייה הוחזר (נדרשת פנימייה)',
    'system.dormitory_stage_skipped': 'שלב הפנימייה דולג (לא נדרשת פנימייה)',
    'system.substage_activated_after_dormitory_skip': 'השלב הופעל (אחרי דילוג על פנימייה)',
    'finals.approved': 'אושר',
    'finals.partial': 'נאסף חלקית',
    'process_names.Приём': 'קבלה',
  }
  return dict[key] ?? fallback ?? key
}

describe('translateSystemEvent', () => {
  it('«Подэтап завершён: <final>» переводит и шаблон, и код исхода', () => {
    expect(translateSystemEvent('Подэтап завершён: approved', t)).toBe('שלב הושלם: אושר')
  })
  it('неизвестный код исхода остаётся как есть', () => {
    expect(translateSystemEvent('Подэтап завершён: weird_code', t)).toBe('שלב הושלם: weird_code')
  })
  it('переводит фиксированные системные строки', () => {
    expect(translateSystemEvent('Подэтап отменён', t)).toBe('שלב בוטל')
    expect(translateSystemEvent('Подэтап активирован', t)).toBe('שלב הופעל')
  })
  it('«Процесс «X» запущен» переводит шаблон и имя процесса', () => {
    expect(translateSystemEvent('Процесс «Приём» запущен', t)).toBe('תהליך הופעל: קבלה')
    expect(translateSystemEvent('Процесс «Неизвестный» запущен', t)).toBe('תהליך הופעל: Неизвестный')
  })
  it('незнакомая строка и пустая строка возвращаются без изменений', () => {
    expect(translateSystemEvent('Произвольный комментарий', t)).toBe('Произвольный комментарий')
    expect(translateSystemEvent('', t)).toBe('')
  })
  it('шаблон должен совпадать целиком (без ложных срабатываний по подстроке)', () => {
    expect(translateSystemEvent('см. Подэтап отменён вчера', t)).toBe('см. Подэтап отменён вчера')
  })
  it('переводит системные строки reactivate_stage и dormitory gating', () => {
    expect(translateSystemEvent('Подэтап активирован вручную', t)).toBe('השלב הופעל ידנית')
    expect(translateSystemEvent('Подэтап переоткрыт для изменения решения', t)).toBe('השלב נפתח מחדש לשינוי החלטה')
    expect(translateSystemEvent('Подэтап активирован (нужен пансион)', t)).toBe('השלב הופעל (נדרשת פנימייה)')
    expect(translateSystemEvent('Этап общежития возвращён (нужен пансион)', t)).toBe('שלב הפנימייה הוחזר (נדרשת פנימייה)')
    expect(translateSystemEvent('Этап общежития пропущен (пансион не нужен)', t)).toBe('שלב הפנימייה דולג (לא נדרשת פנימייה)')
    expect(translateSystemEvent('Подэтап активирован (пересчёт join после skip общежития)', t)).toBe('השלב הופעל (אחרי דילוג על פנימייה)')
  })
  it('«Подэтап активирован (<причина>)» с неизвестной причиной — общий перевод + причина как есть', () => {
    expect(translateSystemEvent('Подэтап активирован (что-то новое)', t)).toBe('שלב הופעל (что-то новое)')
  })
  it('для этапа jewishness исход берётся из acceptance_finals', () => {
    const tEdu = (key: string, fallback?: string) =>
      ({ 'acceptance_finals.partial': 'אישור חלקי' } as Record<string, string>)[key] ?? fallback ?? key
    expect(translateSystemEvent('Подэтап завершён: partial', t, { stageCode: 'jewishness', tEducation: tEdu }))
      .toBe('שלב הושלם: אישור חלקי')
    // другой этап — общий словарь
    expect(translateSystemEvent('Подэтап завершён: partial', t, { stageCode: 'documents', tEducation: tEdu }))
      .toBe('שלב הושלם: נאסף חלקית')
    // без кода этапа — как раньше
    expect(translateSystemEvent('Подэтап завершён: partial', t)).toBe('שלב הושלם: נאסף חלקית')
  })
})
