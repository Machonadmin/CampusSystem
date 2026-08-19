import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Юнит-тесты чистой логики (без БД, без сети): деньги/баланс, метрики
// посещаемости и оценок, генерация дат расписания, выбор scope прав.
// Тесты лежат рядом с кодом в *.test.ts. Алиас '@/...' повторяет tsconfig.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
})
