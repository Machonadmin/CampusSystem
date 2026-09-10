import { createServerClient } from '@/lib/supabase/server'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { PrivilegeModule } from '@/types/database'

/**
 * Почему человека НЕ пускают в модуль.
 *
 * У страницы модуля два независимых шлагбаума, и они могут разойтись:
 *   1. `<module>.access` — его читают middleware, сайдбар и плитки на главной.
 *      Есть access → плитка модуля ВИДНА.
 *   2. `<module>.view` — его проверяет сама страница.
 *      Нет view → redirect('/dashboard').
 * Комбинация «access есть, view нет» выглядит так: плитка на главной есть,
 * но клик по ней молча возвращает на главную. Понять это со стороны
 * невозможно — отсюда эта диагностика: она показывает КАКИЕ права у человека
 * реально есть и какое отсутствует.
 *
 * Отдельный случай — ПУСТОЙ каталог (`module_privileges` без строк модуля):
 * тогда права нечего выдавать, они не появятся ни в «Настройки → Роли», ни в
 * персональных оверрайдах, и чинится это только досевом каталога.
 *
 * Ответ считается ТЕМ ЖЕ путём, что и enforcement: вызывающий передаёт
 * `hasPrivilege` своего модуля (обёртка над makeModulePermissions), поэтому
 * диагностика не может разойтись с реальной проверкой.
 */
export interface ModuleAccessDiagnosis {
  /** Коды привилегий, заведённые для модуля в module_privileges. */
  catalog: string[]
  /** Из них — те, что у человека реально есть. */
  granted: string[]
  /** Каталог модуля пуст: выдавать нечего, нужен досев module_privileges. */
  catalogEmpty: boolean
  /** Каталог прочитать не удалось (ошибка/нет таблицы) — не путать с пустым. */
  catalogUnknown: boolean
}

export async function diagnoseModuleAccess(
  session: SessionPayload,
  module: string,
  hasPrivilege: (session: SessionPayload, code: string) => Promise<boolean>,
): Promise<ModuleAccessDiagnosis> {
  const sb = createServerClient()

  const { data, error } = await sb
    .from('module_privileges')
    .select('privilege_code')
    .eq('module', module as PrivilegeModule)
    .order('sort_order')

  if (error) {
    return { catalog: [], granted: [], catalogEmpty: false, catalogUnknown: true }
  }

  const catalog = [...new Set((data ?? []).map(r => r.privilege_code as string).filter(Boolean))]
  if (catalog.length === 0) {
    return { catalog: [], granted: [], catalogEmpty: true, catalogUnknown: false }
  }

  const flags = await Promise.all(catalog.map(code => hasPrivilege(session, code)))
  const granted = catalog.filter((_, i) => flags[i])

  return { catalog, granted, catalogEmpty: false, catalogUnknown: false }
}
