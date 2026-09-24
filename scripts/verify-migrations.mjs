#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-migrations.mjs
//
// Статически «проигрывает» все миграции в supabase/migrations/ по порядку и
// вычисляет ОЖИДАЕМУЮ финальную схему (таблицы + колонки, добавленные через
// ADD COLUMN), учитывая DROP TABLE / DROP COLUMN / RENAME. Затем печатает ОДИН
// SQL-скрипт, который владелец вставляет в Supabase Dashboard → SQL Editor.
// Скрипт вернёт строки ТОЛЬКО для объектов, которых на живой схеме НЕ хватает
// (пусто = все миграции, судя по схеме, применены).
//
// Почему так: в этом окружении НЕТ доступа к живой БД (нет SUPABASE_*), а
// миграции применяются вручную через Dashboard. Поэтому мы генерируем проверку,
// а не выполняем её.
//
// ОГРАНИЧЕНИЯ (честно): проверяются (1) существование таблиц из CREATE TABLE и
// (2) колонки, добавленные через ALTER TABLE ADD COLUMN. Отдельные колонки
// внутри тела CREATE TABLE не перечисляются — существование самой таблицы
// подтверждает, что её создающая миграция применилась. Enum/функции/индексы
// не проверяются этой версией.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

const files = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()

const tables = new Set()                 // существующие таблицы
const addedCols = new Set()              // "table.col" из ADD COLUMN
const perFile = new Map()                // file -> { tables:[], cols:[] } (для отчёта)

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* ... */
    .replace(/--[^\n]*/g, ' ')           // -- ...
}

function ident(raw) {
  return raw.replace(/"/g, '').replace(/^public\./i, '').trim().toLowerCase()
}

for (const file of files) {
  const sql = stripComments(readFileSync(join(MIG_DIR, file), 'utf8'))
  const rec = { tables: [], cols: [] }

  // DROP TABLE [IF EXISTS] name [CASCADE]
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)/gi)) {
    const t = ident(m[1]); tables.delete(t)
    for (const c of [...addedCols]) if (c.startsWith(t + '.')) addedCols.delete(c)
  }

  // ALTER TABLE old RENAME TO new
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+rename\s+to\s+([a-z0-9_."]+)/gi)) {
    const from = ident(m[1]), to = ident(m[2])
    if (tables.delete(from)) tables.add(to)
    for (const c of [...addedCols]) if (c.startsWith(from + '.')) { addedCols.delete(c); addedCols.add(to + '.' + c.slice(from.length + 1)) }
  }

  // CREATE TABLE [IF NOT EXISTS] name (
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi)) {
    const t = ident(m[1]); tables.add(t); rec.tables.push(t)
  }

  // ALTER TABLE name ... (может содержать несколько ADD/DROP/RENAME COLUMN)
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)([\s\S]*?);/gi)) {
    const t = ident(m[1]); const body = m[2]
    for (const a of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_"]+)/gi)) {
      const c = ident(a[1]); addedCols.add(t + '.' + c); rec.cols.push(t + '.' + c)
    }
    for (const d of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_"]+)/gi)) {
      addedCols.delete(t + '.' + ident(d[1]))
    }
    for (const r of body.matchAll(/rename\s+column\s+([a-z0-9_"]+)\s+to\s+([a-z0-9_"]+)/gi)) {
      const oc = t + '.' + ident(r[1]); if (addedCols.delete(oc)) addedCols.add(t + '.' + ident(r[2]))
    }
  }

  if (rec.tables.length || rec.cols.length) perFile.set(file, rec)
}

const tableList = [...tables].sort()
const colList = [...addedCols].sort()

// ── Печать сводки (в stderr, чтобы не мешать SQL в stdout) ──
console.error(`Проигранных миграций: ${files.length}`)
console.error(`Ожидаемых таблиц:     ${tableList.length}`)
console.error(`Ожидаемых ADD-колонок: ${colList.length}`)
console.error('')

// ── Печать SQL-проверки (stdout) ──
const tvals = tableList.map(t => `('${t}')`).join(',\n  ')
const cvals = colList.map(tc => { const [t, c] = tc.split('.'); return `('${t}','${c}')` }).join(',\n  ')

const out = `-- ═══════════════════════════════════════════════════════════════════════════
-- ПРОВЕРКА ПРИМЕНЁННЫХ МИГРАЦИЙ — сгенерировано scripts/verify-migrations.mjs
-- Вставьте ЦЕЛИКОМ в Supabase Dashboard → SQL Editor и запустите.
-- Пустой результат ⇒ все ожидаемые таблицы и ADD-колонки на месте.
-- Непустой ⇒ перечислены недостающие объекты (миграция не применена).
-- Основано на ${files.length} файлах миграций; ${tableList.length} таблиц, ${colList.length} ADD-колонок.
-- ═══════════════════════════════════════════════════════════════════════════

WITH expected_tables(t) AS (VALUES
  ${tvals}
),
expected_columns(t, c) AS (VALUES
  ${cvals}
)
SELECT 'MISSING TABLE'  AS problem, et.t AS table_name, NULL AS column_name
FROM expected_tables et
LEFT JOIN information_schema.tables it
  ON it.table_schema = 'public' AND it.table_name = et.t
WHERE it.table_name IS NULL
UNION ALL
SELECT 'MISSING COLUMN' AS problem, ec.t AS table_name, ec.c AS column_name
FROM expected_columns ec
JOIN information_schema.tables it
  ON it.table_schema = 'public' AND it.table_name = ec.t   -- колонку проверяем только если таблица есть
LEFT JOIN information_schema.columns ic
  ON ic.table_schema = 'public' AND ic.table_name = ec.t AND ic.column_name = ec.c
WHERE ic.column_name IS NULL
ORDER BY problem, table_name, column_name;
`

process.stdout.write(out)
