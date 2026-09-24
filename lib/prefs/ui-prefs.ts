/**
 * Личная раскладка интерфейса сотрудника (таблица user_preferences, колонка prefs).
 *
 * Что здесь хранится — ТОЛЬКО раскладка экрана, не права:
 *   • favorites — избранные пункты меню, в порядке, который выбрал человек.
 *     Они поднимаются наверх бокового меню и первыми идут в плитках главной;
 *   • hidden    — пункты меню, которые человек убрал из меню и с главной;
 *   • widgets   — порядок и видимость блоков «Моя работа» на главной;
 *   • tiles     — плитки модулей на главной: все или только избранные.
 *
 * Права решает сервер. Раскладка применяется ПОВЕРХ уже отфильтрованного по
 * правам списка (applyNavPrefs получает только доступные пункты), поэтому ни
 * одна настройка не может показать то, что человеку недоступно. id, которых
 * нет среди доступных (право отобрали, пункт переименовали), просто
 * игнорируются при показе и не мешают.
 */

export const WIDGET_IDS = [
  'agenda',
  'pending_signatures',
  'my_tasks',
  'my_maintenance',
  'my_lessons',
  'recent_leads',
  'stalled',
  'my_alerts',
  'my_absences',
] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export type TilesMode = 'all' | 'favorites'

export interface UiPrefs {
  favorites: string[]
  hidden: string[]
  widgets: { order: WidgetId[]; hidden: WidgetId[] }
  tiles: TilesMode
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  favorites: [],
  hidden: [],
  widgets: { order: [...WIDGET_IDS], hidden: [] },
  tiles: 'all',
}

// id пункта меню — код модуля или раздела: латиница/цифры/подчёркивание.
const NAV_ID = /^[a-z][a-z0-9_]{0,39}$/
const MAX_NAV_IDS = 60

function isWidgetId(v: unknown): v is WidgetId {
  return typeof v === 'string' && (WIDGET_IDS as readonly string[]).includes(v)
}

function navIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || !NAV_ID.test(x) || out.includes(x)) continue
    out.push(x)
    if (out.length >= MAX_NAV_IDS) break
  }
  return out
}

function widgetIds(v: unknown): WidgetId[] {
  if (!Array.isArray(v)) return []
  const out: WidgetId[] = []
  for (const x of v) if (isWidgetId(x) && !out.includes(x)) out.push(x)
  return out
}

/**
 * Приводит что угодно (тело запроса, строку из БД, мусор) к корректной
 * раскладке. Неизвестные ключи и значения отбрасываются, дубликаты убираются.
 * Порядок блоков всегда содержит ВСЕ известные блоки: сохранённый порядок
 * первым, новые (добавленные позже в код) — в конце, по умолчанию видимые.
 */
export function sanitizeUiPrefs(input: unknown): UiPrefs {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const w = (src.widgets && typeof src.widgets === 'object' ? src.widgets : {}) as Record<string, unknown>

  const favorites = navIds(src.favorites)
  // Избранное и скрытое взаимоисключающие: избранное важнее.
  const hidden = navIds(src.hidden).filter(id => !favorites.includes(id))

  const savedOrder = widgetIds(w.order)
  const order = [...savedOrder, ...WIDGET_IDS.filter(id => !savedOrder.includes(id))]

  return {
    favorites,
    hidden,
    widgets: { order, hidden: widgetIds(w.hidden) },
    tiles: src.tiles === 'favorites' ? 'favorites' : 'all',
  }
}

/**
 * Раскладывает ДОСТУПНЫЕ пункты меню по личным настройкам.
 *   favorites — избранные, в порядке избранного;
 *   rest      — остальные в исходном порядке, без избранных и без скрытых.
 * Пункты, которых нет в items, не появляются никогда (права важнее раскладки).
 */
export function applyNavPrefs<T extends { id: string }>(items: T[], prefs: UiPrefs): { favorites: T[]; rest: T[] } {
  const byId = new Map(items.map(it => [it.id, it]))
  const favorites = prefs.favorites.map(id => byId.get(id)).filter((it): it is T => !!it)
  const favSet = new Set(favorites.map(it => it.id))
  const hidden = new Set(prefs.hidden)
  const rest = items.filter(it => !favSet.has(it.id) && !hidden.has(it.id))
  return { favorites, rest }
}

/** Видимые блоки главной в личном порядке. */
export function visibleWidgets(prefs: UiPrefs): WidgetId[] {
  const hidden = new Set(prefs.widgets.hidden)
  return prefs.widgets.order.filter(id => !hidden.has(id))
}

/** Переставить элемент списка на одну позицию (dir −1 — выше, +1 — ниже). */
export function moveItem<T>(list: readonly T[], item: T, dir: -1 | 1): T[] {
  const i = list.indexOf(item)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  next[i] = next[j]
  next[j] = item
  return next
}

/** Добавить/убрать пункт из избранного (новый избранный — в конец). */
export function toggleFavorite(prefs: UiPrefs, id: string): UiPrefs {
  const isFav = prefs.favorites.includes(id)
  return sanitizeUiPrefs({
    ...prefs,
    favorites: isFav ? prefs.favorites.filter(x => x !== id) : [...prefs.favorites, id],
    hidden: prefs.hidden.filter(x => x !== id),
  })
}

/** Скрыть/вернуть пункт меню (скрытый перестаёт быть избранным). */
export function toggleHidden(prefs: UiPrefs, id: string): UiPrefs {
  const isHidden = prefs.hidden.includes(id)
  return sanitizeUiPrefs({
    ...prefs,
    hidden: isHidden ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id],
    favorites: isHidden ? prefs.favorites : prefs.favorites.filter(x => x !== id),
  })
}
