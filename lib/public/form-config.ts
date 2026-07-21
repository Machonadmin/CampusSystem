import { getAppSetting, setAppSetting } from '@/lib/settings/app-settings'

// ─── Конфигурация публичной формы заявки (управляется набором/גיוס) ─────────
//
// Хранится в app_settings под одним ключом (одно-организационное приложение).
// Deploy-safe: getAppSetting возвращает fallback, если таблицы/строки ещё нет.
// Дефолт полностью повторяет прежнее «захардкоженное» поведение формы, поэтому
// до первой настройки страница выглядит и работает как раньше.

const KEY = 'public_form_config'

// Встроенные необязательные поля, которые набор может включать/выключать и
// делать обязательными. first_name и phone — ЯДРО (всегда видимы и обязательны):
// без них лид бесполезен, поэтому их нельзя отключить.
export const BUILTIN_FIELDS = [
  'last_name', 'email', 'birth_date', 'city', 'direction', 'applicant_type', 'comment',
] as const
export type BuiltinFieldKey = (typeof BUILTIN_FIELDS)[number]

export interface FieldSetting {
  key: BuiltinFieldKey
  visible: boolean
  required: boolean
}

export type CustomFieldType = 'text' | 'textarea' | 'select'

export interface CustomField {
  key: string                                  // стабильный id: 'c1', 'c2', …
  type: CustomFieldType
  label: { he: string; ru: string; en: string }
  options: string[]                            // только для select
  required: boolean
  visible: boolean
}

export interface DirectionsSetting {
  mode: 'all' | 'subset'
  ids: string[]                                // reference_directions.id при mode='subset'
}

export interface PublicFormConfig {
  fields: FieldSetting[]
  customFields: CustomField[]
  directions: DirectionsSetting
  // Переопределения маркетинговых текстов: lang → ключ i18n (apply.*) → текст.
  // Пусто ⇒ используется перевод по умолчанию.
  texts: Record<string, Record<string, string>>
}

export const DEFAULT_FIELD_SETTINGS: FieldSetting[] = BUILTIN_FIELDS.map(key => ({
  key, visible: true, required: false,
}))

export const DEFAULT_CONFIG: PublicFormConfig = {
  fields: DEFAULT_FIELD_SETTINGS,
  customFields: [],
  directions: { mode: 'all', ids: [] },
  texts: {},
}

const CUSTOM_TYPES: CustomFieldType[] = ['text', 'textarea', 'select']

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Приводит произвольный сохранённый объект к валидному PublicFormConfig:
 * все встроенные поля присутствуют (недостающие — из дефолта, неизвестные —
 * отброшены), кастомные поля санитизированы, directions/texts корректны.
 * Любой мусор из БД не должен ронять ни публичную форму, ни админку.
 */
export function normalizeConfig(raw: unknown): PublicFormConfig {
  const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}

  const storedFields = Array.isArray(r.fields) ? (r.fields as unknown[]) : []
  const byKey = new Map<string, { visible: boolean; required: boolean }>()
  for (const f of storedFields) {
    if (f && typeof f === 'object') {
      const o = f as Record<string, unknown>
      const k = str(o.key)
      if ((BUILTIN_FIELDS as readonly string[]).includes(k)) {
        byKey.set(k, { visible: o.visible !== false, required: o.required === true })
      }
    }
  }
  const fields: FieldSetting[] = BUILTIN_FIELDS.map(key => {
    const s = byKey.get(key)
    return { key, visible: s ? s.visible : true, required: s ? s.required : false }
  })

  const rawCustom = Array.isArray(r.customFields) ? (r.customFields as unknown[]) : []
  const customFields: CustomField[] = rawCustom
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, i) => {
      const type = CUSTOM_TYPES.includes(c.type as CustomFieldType) ? (c.type as CustomFieldType) : 'text'
      const lbl = (c.label && typeof c.label === 'object') ? (c.label as Record<string, unknown>) : {}
      const options = Array.isArray(c.options) ? c.options.map(str).filter(Boolean) : []
      return {
        key: str(c.key) || `c${i + 1}`,
        type,
        label: { he: str(lbl.he), ru: str(lbl.ru), en: str(lbl.en) },
        options,
        required: c.required === true,
        visible: c.visible !== false,
      }
    })

  const d = (r.directions && typeof r.directions === 'object') ? (r.directions as Record<string, unknown>) : {}
  const directions: DirectionsSetting = {
    mode: d.mode === 'subset' ? 'subset' : 'all',
    ids: Array.isArray(d.ids) ? d.ids.map(str).filter(Boolean) : [],
  }

  const texts: Record<string, Record<string, string>> = {}
  if (r.texts && typeof r.texts === 'object') {
    for (const [lang, v] of Object.entries(r.texts as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const inner: Record<string, string> = {}
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          const s = str(val).trim()
          if (s) inner[k] = s
        }
        if (Object.keys(inner).length) texts[lang] = inner
      }
    }
  }

  return { fields, customFields, directions, texts }
}

export async function getPublicFormConfig(): Promise<PublicFormConfig> {
  const raw = await getAppSetting<unknown>(KEY, null)
  return normalizeConfig(raw)
}

export async function savePublicFormConfig(cfg: unknown, updatedBy: string): Promise<PublicFormConfig> {
  const normalized = normalizeConfig(cfg)
  await setAppSetting(KEY, normalized, updatedBy)
  return normalized
}
