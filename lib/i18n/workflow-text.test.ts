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
    'finals.approved': 'אושר',
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
})
