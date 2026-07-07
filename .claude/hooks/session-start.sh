#!/bin/bash
# Устанавливает зависимости, чтобы юнит-тесты (vitest) и проверка типов (tsc)
# работали в сессиях Claude Code on the web. Идемпотентно и без интерактива.
set -euo pipefail

# Только в удалённой среде (Claude Code on the web); локально ничего не делаем.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# npm install (а не ci): переиспользует кэш контейнера между сессиями.
npm install --no-audit --no-fund
