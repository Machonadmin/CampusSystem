/**
 * «Вернуться назад и показать свежие данные». После сохранения формы правки мы
 * возвращаемся на карточку РЕАЛЬНЫМ back (а не push), чтобы в истории не
 * оставалась форма правки: иначе «назад» с карточки снова открывал форму. Но
 * back в App Router отдаёт страницу из клиентского кэша (старые данные) — поэтому
 * форма помечает путь карточки, а карточка при монтировании «съедает» метку и
 * делает router.refresh().
 *
 * sessionStorage может быть недоступен (приватный режим, SSR) — тогда метка
 * просто не ставится, а карточка показывает кэш (не хуже, чем раньше).
 */

const KEY = 'campus:refresh-on-return'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStore(): Store | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** Пометить путь: при следующем показе этой страницы обновить её данные. */
export function markRefreshOnReturn(path: string, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, path) } catch { /* хранилище недоступно — без метки */ }
}

/** true — если путь был помечен (метка снимается, срабатывает один раз). */
export function consumeRefreshOnReturn(path: string, store: Store | null = defaultStore()): boolean {
  try {
    if (!store || store.getItem(KEY) !== path) return false
    store.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
