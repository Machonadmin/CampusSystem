import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UI_PREFS, WIDGET_IDS, applyNavPrefs, moveItem, sanitizeUiPrefs,
  toggleFavorite, toggleHidden, visibleWidgets,
} from './ui-prefs'

describe('sanitizeUiPrefs', () => {
  it('мусор → раскладка по умолчанию', () => {
    expect(sanitizeUiPrefs(null)).toEqual(DEFAULT_UI_PREFS)
    expect(sanitizeUiPrefs('x')).toEqual(DEFAULT_UI_PREFS)
    expect(sanitizeUiPrefs({ favorites: 'finance', tiles: 'weird' })).toEqual(DEFAULT_UI_PREFS)
  })

  it('отбрасывает кривые id и дубликаты', () => {
    const p = sanitizeUiPrefs({ favorites: ['finance', 'finance', 'Bad-Id', 42, '../x', 'food'] })
    expect(p.favorites).toEqual(['finance', 'food'])
  })

  it('избранное важнее скрытого', () => {
    const p = sanitizeUiPrefs({ favorites: ['finance'], hidden: ['finance', 'food'] })
    expect(p.hidden).toEqual(['food'])
  })

  it('порядок блоков: сохранённый первым, новые блоки дописываются в конец', () => {
    const p = sanitizeUiPrefs({ widgets: { order: ['my_tasks', 'unknown', 'agenda'] } })
    expect(p.widgets.order.slice(0, 2)).toEqual(['my_tasks', 'agenda'])
    expect([...p.widgets.order].sort()).toEqual([...WIDGET_IDS].sort())
  })

  it('раскладка, сохранённая до появления my_alerts/my_absences, получает их в конце и видимыми', () => {
    const saved = ['stalled', 'agenda', 'pending_signatures', 'my_tasks', 'my_maintenance', 'my_lessons', 'recent_leads']
    const p = sanitizeUiPrefs({ widgets: { order: saved, hidden: ['agenda'] } })
    expect(p.widgets.order).toEqual([...saved, 'my_alerts', 'my_absences'])
    expect(visibleWidgets(p)).toContain('my_alerts')
    expect(visibleWidgets(p)).toContain('my_absences')
  })

  it('my_alerts/my_absences — известные блоки: сохраняются в порядке и в скрытых', () => {
    const p = sanitizeUiPrefs({ widgets: { order: ['my_absences', 'my_alerts'], hidden: ['my_alerts'] } })
    expect(p.widgets.order.slice(0, 2)).toEqual(['my_absences', 'my_alerts'])
    expect(p.widgets.hidden).toEqual(['my_alerts'])
  })

  it('ограничивает длину списков', () => {
    const many = Array.from({ length: 200 }, (_, i) => `m${i}`)
    expect(sanitizeUiPrefs({ hidden: many }).hidden.length).toBe(60)
  })
})

describe('applyNavPrefs', () => {
  const items = [{ id: 'persons' }, { id: 'finance' }, { id: 'food' }, { id: 'security' }]

  it('без настроек — всё как было', () => {
    expect(applyNavPrefs(items, DEFAULT_UI_PREFS)).toEqual({ favorites: [], rest: items })
  })

  it('избранные — наверх в своём порядке, скрытые — пропадают', () => {
    const prefs = sanitizeUiPrefs({ favorites: ['food', 'persons'], hidden: ['security'] })
    const r = applyNavPrefs(items, prefs)
    expect(r.favorites.map(i => i.id)).toEqual(['food', 'persons'])
    expect(r.rest.map(i => i.id)).toEqual(['finance'])
  })

  it('настройка не может показать недоступный пункт (права важнее раскладки)', () => {
    const prefs = sanitizeUiPrefs({ favorites: ['data_security', 'finance'] })
    const r = applyNavPrefs(items, prefs)
    expect(r.favorites.map(i => i.id)).toEqual(['finance'])
    expect([...r.favorites, ...r.rest].some(i => i.id === 'data_security')).toBe(false)
  })
})

describe('помощники', () => {
  it('visibleWidgets уважает порядок и скрытые', () => {
    const p = sanitizeUiPrefs({ widgets: { order: ['my_tasks', 'agenda'], hidden: ['agenda'] } })
    const v = visibleWidgets(p)
    expect(v[0]).toBe('my_tasks')
    expect(v).not.toContain('agenda')
  })

  it('moveItem двигает на одну позицию и не выходит за края', () => {
    expect(moveItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b'], 'z', 1)).toEqual(['a', 'b'])
  })

  it('toggleFavorite / toggleHidden взаимоисключающие', () => {
    let p = toggleHidden(DEFAULT_UI_PREFS, 'food')
    expect(p.hidden).toEqual(['food'])
    p = toggleFavorite(p, 'food')
    expect(p.favorites).toEqual(['food'])
    expect(p.hidden).toEqual([])
    p = toggleHidden(p, 'food')
    expect(p.favorites).toEqual([])
    expect(p.hidden).toEqual(['food'])
  })
})
