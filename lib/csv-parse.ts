/**
 * Небольшой устойчивый CSV-парсер (без зависимостей) для импорта.
 * Поддержка: BOM, авто-разделитель (запятая/точка-с-запятой/таб), поля в
 * кавычках с экранированием "", переводы строк CRLF/LF, пустые строки.
 */

/** Угадывает разделитель по первой строке: ; \t или , (по количеству). */
export function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && ch in counts) counts[ch]++
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';'
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
  return ','
}

/** Разбирает CSV-текст в матрицу строк. Пустые строки (все ячейки пустые) отбрасываются. */
export function parseCsv(text: string, delimiter?: ',' | ';' | '\t'): string[][] {
  let s = text
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1) // BOM
  const firstNl = s.search(/\r?\n/)
  const firstLine = firstNl === -1 ? s : s.slice(0, firstNl)
  const delim = delimiter ?? detectDelimiter(firstLine)

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQ = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQ = false
      } else field += ch
    } else if (ch === '"') {
      inQ = true
    } else if (ch === delim) {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
    } else if (ch === '\r') {
      // ждём \n (или конец) — просто игнорируем \r
    } else {
      field += ch
    }
  }
  // хвост
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter(r => r.some(c => c.trim() !== ''))
}
