#!/bin/bash
# Собирает все миграции из supabase/migrations в один файл
# supabase/staging-bootstrap.sql — его можно один раз вставить в SQL Editor
# нового (пустого) проекта Supabase, чтобы воспроизвести всю схему для staging.
#
# Порядок файлов — лексикографический (001_, 002_, ... 2026...), совпадает с
# реальным порядком применения. Идемпотентно: просто перезаписывает результат.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="supabase/staging-bootstrap.sql"
MIG_DIR="supabase/migrations"

{
  echo "-- ============================================================"
  echo "-- CampusSystem — staging bootstrap (СГЕНЕРИРОВАНО, не редактировать)"
  echo "-- Источник: $MIG_DIR (все миграции в порядке применения)"
  echo "-- Собрать заново: bash scripts/build-staging-bootstrap.sh"
  echo "-- Применение: SQL Editor нового проекта Supabase → вставить → Run"
  echo "-- ============================================================"
  echo
  for f in "$MIG_DIR"/*.sql; do
    echo
    echo "-- ─────────────────────────────────────────────────────────"
    echo "-- $(basename "$f")"
    echo "-- ─────────────────────────────────────────────────────────"
    cat "$f"
    echo
  done
} > "$OUT"

lines=$(wc -l < "$OUT")
files=$(ls "$MIG_DIR"/*.sql | wc -l)
echo "Готово: $OUT ($files миграций, $lines строк)."
