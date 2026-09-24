/**
 * Чистые помощники нормализации при импорте студенток из внешнего файла
 * (напр. выгрузка CRM: ФИО «Фамилия Имя Отчество», дата ДД.ММ.ГГГГ, пол
 * «Женщина» и т.п.). Все функции чистые и тестируемые.
 */

/** Поля системы, куда можно замапить колонку файла. */
export const IMPORT_FIELDS = [
  'full_name', 'first_name', 'last_name', 'middle_name', 'hebrew_name',
  'gender', 'birth_date', 'phone', 'email', 'city', 'country',
  'passport_number', 'note',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** ДД.ММ.ГГГГ / ДД/ММ/ГГГГ / ГГГГ-ММ-ДД → ISO 'YYYY-MM-DD' (или null). */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return iso(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) return iso(m[3], m[2], m[1])
  return null
}
function iso(y: string, mo: string, d: string): string | null {
  const Y = +y, M = +mo, D = +d
  if (M < 1 || M > 12 || D < 1 || D > 31) return null
  return `${Y.toString().padStart(4, '0')}-${M.toString().padStart(2, '0')}-${D.toString().padStart(2, '0')}`
}

/**
 * Разбор ФИО. По умолчанию порядок «Фамилия Имя Отчество» (как в русских CRM):
 *   3 слова → last, first, middle; 2 → last, first; 1 → first.
 */
export function splitFullName(
  raw: string | null | undefined,
  order: 'last-first-middle' | 'first-last' = 'last-first-middle',
): { first_name: string; last_name: string | null; middle_name: string | null } {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: '', last_name: null, middle_name: null }
  if (parts.length === 1) return { first_name: parts[0], last_name: null, middle_name: null }
  if (order === 'first-last') {
    return { first_name: parts[0], last_name: parts.slice(1).join(' '), middle_name: null }
  }
  // last-first-middle
  if (parts.length === 2) return { last_name: parts[0], first_name: parts[1], middle_name: null }
  return { last_name: parts[0], first_name: parts[1], middle_name: parts.slice(2).join(' ') }
}

/** «Женщина/жен/ж/female/נקבה» → female; «Мужчина/муж/male/זכר» → male; иначе null. */
export function normalizeGender(raw: string | null | undefined): 'male' | 'female' | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (/^(ж|жен|женщина|female|f|נקבה|נ)/.test(s)) return 'female'
  if (/^(м|муж|мужчина|male|m|זכר|ז)/.test(s)) return 'male'
  return null
}

/** Только цифры телефона (для сравнения/дедупа); '' если пусто. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

/**
 * Ключ дедупликации строки: по телефону (если есть), иначе по имени+дате
 * рождения. Пусто → '' (такие строки не дедупятся между собой).
 */
export function dedupeKey(row: { phone?: string | null; first_name?: string | null; last_name?: string | null; birth_date?: string | null }): string {
  const ph = phoneDigits(row.phone)
  if (ph.length >= 6) return `p:${ph}`
  const name = `${(row.first_name ?? '').trim().toLowerCase()} ${(row.last_name ?? '').trim().toLowerCase()}`.trim()
  const bd = (row.birth_date ?? '').trim()
  if (name && bd) return `nb:${name}|${bd}`
  return ''
}

/** Авто-подбор поля по заголовку колонки (RU/HE/EN синонимы). null если не понятно. */
export function guessField(header: string): ImportField | null {
  const h = header.trim().toLowerCase()
  const has = (...xs: string[]) => xs.some(x => h.includes(x))
  if (has('фио', 'ф.и.о', 'שם מלא', 'full name', 'фамилия имя')) return 'full_name'
  if (has('еврейское имя', 'hebrew', 'שם עברי', 'שם קודש')) return 'hebrew_name'
  if (has('отчество', 'middle')) return 'middle_name'
  if (has('фамилия', 'last name', 'surname', 'משפחה')) return 'last_name'
  if (has('имя', 'first name', 'פרטי')) return 'first_name'
  if (has('дата рожд', 'birth', 'לידה', 'д.р')) return 'birth_date'
  if (has('пол', 'gender', 'מין')) return 'gender'
  if (has('телефон', 'phone', 'моб', 'טלפון', 'tel')) return 'phone'
  if (has('mail', 'почта', 'מייל', 'דוא')) return 'email'
  if (has('город', 'city', 'עיר')) return 'city'
  if (has('страна', 'country', 'מדינה', 'гражданств')) return 'country'
  if (has('паспорт', 'passport', 'דרכון', 'ת.ז', 'תעודת זהות')) return 'passport_number'
  if (has('примечание', 'note', 'comment', 'הערה', 'коммент')) return 'note'
  return null
}
