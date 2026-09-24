import { describe, it, expect } from 'vitest'
import { apiErrorWith } from './api-errors'
import ru from '@/messages/ru.json'

// Вне request-scope serverT берёт 'ru' (язык-источник) — см. api-errors.ts.
describe('apiErrorWith — подстановка {placeholder}', () => {
  it('подставляет все значения и сохраняет форму { error, code }', async () => {
    const res = apiErrorWith('task_transition_forbidden', 400, { from: 'open', to: 'done' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('task_transition_forbidden')
    expect(body.error).toBe((ru as { errors: Record<string, string> }).errors.task_transition_forbidden
      .replace('{from}', 'open').replace('{to}', 'done'))
    expect(body.error).not.toContain('{')
  })

  it('числа и null приводятся к строке; extra-поля добавляются', async () => {
    const res = apiErrorWith('schedule_range_too_large', 400, { days: 400, max: null }, { limit: 90 })
    const body = await res.json()
    expect(body.error).toContain('400')
    expect(body.limit).toBe(90)
  })

  it('каждый ключ с плейсхолдерами существует во всех трёх языках с теми же плейсхолдерами', async () => {
    const he = (await import('@/messages/he.json')).default as { errors: Record<string, string> }
    const en = (await import('@/messages/en.json')).default as { errors: Record<string, string> }
    const rr = (ru as { errors: Record<string, string> }).errors
    const ph = (s: string) => (s.match(/\{[a-z_]+\}/g) ?? []).sort().join(',')
    for (const [k, v] of Object.entries(rr)) {
      if (!v.includes('{')) continue
      expect(ph(he.errors[k] ?? ''), `he.errors.${k}`).toBe(ph(v))
      expect(ph(en.errors[k] ?? ''), `en.errors.${k}`).toBe(ph(v))
    }
  })
})
