import { describe, it, expect } from 'vitest'
import {
  normalizeBody, normalizePagePath, checkScreenshots, parseStatusPatch,
  isFeedbackKind, MAX_BODY_CHARS, MAX_SCREENSHOTS, MAX_SCREENSHOT_BYTES,
} from './validation'
import { evaluateCronAuth } from '@/lib/cron/auth'

describe('feedback: текст и страница', () => {
  it('пустой или слишком длинный текст не принимается', () => {
    expect(normalizeBody('   ')).toBeNull()
    expect(normalizeBody(42)).toBeNull()
    expect(normalizeBody('x'.repeat(MAX_BODY_CHARS + 1))).toBeNull()
    expect(normalizeBody('  кнопка не работает ')).toBe('кнопка не работает')
  })

  it('страница — только путь внутри сайта', () => {
    expect(normalizePagePath('/dashboard/persons')).toBe('/dashboard/persons')
    expect(normalizePagePath('https://evil.example/x')).toBeNull()
    expect(normalizePagePath('//evil.example')).toBeNull()
    expect(normalizePagePath(null)).toBeNull()
  })

  it('тип — только bug / suggestion', () => {
    expect(isFeedbackKind('bug')).toBe(true)
    expect(isFeedbackKind('suggestion')).toBe(true)
    expect(isFeedbackKind('delete_everything')).toBe(false)
  })
})

describe('feedback: скриншоты', () => {
  const png = { type: 'image/png', size: 1000 }
  it('до лимита — ок', () => {
    expect(checkScreenshots([])).toBeNull()
    expect(checkScreenshots(Array(MAX_SCREENSHOTS).fill(png))).toBeNull()
  })
  it('больше лимита, не картинка, слишком большой — отказ', () => {
    expect(checkScreenshots(Array(MAX_SCREENSHOTS + 1).fill(png))).toBe('too_many')
    expect(checkScreenshots([{ type: 'application/pdf', size: 10 }])).toBe('bad_type')
    expect(checkScreenshots([{ type: 'image/svg+xml', size: 10 }])).toBe('bad_type')
    expect(checkScreenshots([{ type: 'image/jpeg', size: MAX_SCREENSHOT_BYTES + 1 }])).toBe('too_large')
  })
})

describe('feedback: смена статуса', () => {
  it('принимает статус и ответ', () => {
    expect(parseStatusPatch({ status: 'done', owner_reply: ' сделано ' }))
      .toEqual({ status: 'done', owner_reply: 'сделано' })
    expect(parseStatusPatch({ owner_reply: '' })).toEqual({ owner_reply: null })
  })
  it('отвергает пустое, чужой статус и посторонние типы', () => {
    expect(parseStatusPatch({})).toBeNull()
    expect(parseStatusPatch(null)).toBeNull()
    expect(parseStatusPatch({ status: 'deleted' })).toBeNull()
    expect(parseStatusPatch({ owner_reply: 5 })).toBeNull()
  })
})

describe('feedback: вход для Claude закрыт без токена', () => {
  it('FEEDBACK_AGENT_TOKEN не задан → 503 даже с заголовком', () => {
    expect(evaluateCronAuth(undefined, 'Bearer anything')).toEqual({ ok: false, status: 503, reason: 'not_configured' })
  })
  it('неверный токен → 401', () => {
    expect(evaluateCronAuth('right-token-123', 'Bearer wrong').ok).toBe(false)
  })
})
