// ─── Экспорт в CSV (клиентский, из уже загруженных данных) ───────────────────
//
// UTF-8 BOM в начале — чтобы Excel корректно открыл иврит/кириллицу. Значения с
// запятой/кавычкой/переводом строки экранируются по RFC 4180.

type Cell = string | number | null | undefined

function escapeCell(v: Cell): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Собирает CSV-строку из заголовков и строк. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) lines.push(row.map(escapeCell).join(','))
  return lines.join('\r\n')
}

/** Скачивает данные как CSV-файл (в браузере). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const csv = toCsv(headers, rows)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
