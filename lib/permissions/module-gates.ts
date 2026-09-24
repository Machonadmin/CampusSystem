/**
 * ─── «Видит ⇔ может войти» ───────────────────────────────────────────────────
 *
 * Правило владельца: если у человека есть доступ — он видит модуль и заходит;
 * если доступа нет — он не заходит И НЕ ВИДИТ.
 *
 * До этого правила у одного экрана было ДВА независимых шлагбаума:
 *   • `<module>.access` — по нему рисуются плитка на главной и пункт меню;
 *   • `<module>.view`   — его проверяет сама страница модуля.
 * Когда выдан только первый, модуль виден, но не открывается. Именно так
 * «пропал» вход в «Эксплуатацию»: плитка на месте, клик возвращает на главную.
 *
 * Здесь — ОДИН источник правды о том, какое право требует страница модуля.
 * Его используют и вычисление видимых модулей (/api/auth/me → сайдбар и
 * плитки), и, через тест-страж module-gates.test.ts, сами страницы: тест
 * сканирует app/dashboard/<module>/page.tsx и падает, если страница начнёт
 * требовать право, которого нет в этой карте (иначе разъедется снова).
 *
 * Никаких прав это НЕ выдаёт: карта только СУЖАЕТ видимость до того, что
 * человек реально может открыть.
 */

// Обе карты теперь ВЫВОДЯТСЯ из реестра модулей (lib/modules/registry.ts) —
// единственного источника правды о модулях. Раньше они жили здесь отдельным
// списком, а middleware, /api/auth/me и палитра — своими, и все четыре
// разошлись. Re-export сохранён, чтобы вызывающий код и страж ниже не менялись.
// Импорт + re-export, а не `export ... from`: visibleModules() ниже читает
// MODULE_PAGE_PRIVILEGE как локальную переменную, а сквозной re-export в
// локальную область видимости имя не вносит.
import { MODULE_PAGE_PRIVILEGE, MODULE_GATE_EXCEPTIONS } from '@/lib/modules/registry'

export { MODULE_PAGE_PRIVILEGE, MODULE_GATE_EXCEPTIONS }

/** Строка привилегий человека в одном модуле. */
export type EffectivePrivileges = ReadonlyMap<string, ReadonlySet<string>>

/**
 * Собирает действующие привилегии по модулям: роли дают, персональные
 * оверрайды поверх них добавляют (grant) или отнимают (deny). Просроченные
 * оверрайды игнорируются. Чистая функция — покрыта юнит-тестами.
 */
export function effectivePrivileges(
  roleRows: readonly { module: string; privilege_code: string }[],
  personRows: readonly { module: string; privilege_code: string; is_granted: boolean; expires_at?: string | null }[],
  nowMs: number,
): Map<string, Set<string>> {
  const byModule = new Map<string, Set<string>>()
  const add = (module: string, code: string) => {
    if (!module || !code) return
    let set = byModule.get(module)
    if (!set) { set = new Set(); byModule.set(module, set) }
    set.add(code)
  }

  for (const r of roleRows) add(r.module, r.privilege_code)

  for (const r of personRows) {
    if (!r.module || !r.privilege_code) continue
    if (r.expires_at && new Date(r.expires_at).getTime() <= nowMs) continue
    if (r.is_granted) {
      add(r.module, r.privilege_code)
    } else {
      byModule.get(r.module)?.delete(r.privilege_code)
    }
  }

  return byModule
}

/**
 * Модули, которые человек должен видеть в меню и на главной: есть 'access' И
 * есть право, которое требует сама страница (если такое право у неё есть).
 */
export function visibleModules(effective: EffectivePrivileges): string[] {
  const out: string[] = []
  for (const [module, codes] of effective) {
    if (!codes.has('access')) continue
    const required = MODULE_PAGE_PRIVILEGE[module]
    if (required && !codes.has(required)) continue
    out.push(module)
  }
  return out
}
