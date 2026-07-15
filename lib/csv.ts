/**
 * Минимальный CSV-экспорт для клиентских дашбордов. RFC-4180 экранирование
 * (кавычки/запятые/переводы строк) + BOM, чтобы Excel корректно открывал
 * иврит/кириллицу в UTF-8.
 */

/** Экранирует одно поле CSV. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Собирает CSV-строку из строк-массивов ячеек. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

/**
 * Скачивает CSV как файл (браузер). BOM обязателен для Excel + иврит.
 * Возвращает false в не-браузерном окружении (SSR/тест) — вызывать из onClick.
 */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false
  const csv = '﻿' + toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}
