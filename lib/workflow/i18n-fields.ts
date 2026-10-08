// Поля названий/описаний шаблонов процессов на иврите и английском
// (миграция 20261008120200_workflow_names_i18n.sql). Пустая строка → NULL:
// «переопределения нет, показывать стандартный перевод из словаря».
// В patch попадают только поля, которые пришли в теле запроса.

export type WorkflowI18nField = 'name_he' | 'name_en' | 'description_he' | 'description_en'

export function pickWorkflowI18n(
  body: Record<string, unknown>,
  fields: readonly WorkflowI18nField[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of fields) {
    if (!(f in body)) continue
    const v = body[f]
    out[f] = typeof v === 'string' && v.trim() ? v.trim() : null
  }
  return out
}

export const PROCESS_I18N_FIELDS = ['name_he', 'name_en', 'description_he', 'description_en'] as const
export const STAGE_I18N_FIELDS = ['name_he', 'name_en', 'description_he', 'description_en'] as const
export const FINAL_I18N_FIELDS = ['name_he', 'name_en'] as const
