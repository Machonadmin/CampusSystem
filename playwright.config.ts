import { defineConfig, devices } from '@playwright/test'

// ─── E2E-тесты (Layer 3 решётки безопасности) ────────────────────────────────
//
// Гоняются против ЖИВОГО URL — обычно staging (Layer 2), заданного через
// E2E_BASE_URL. Локально по умолчанию http://localhost:3000.
//
// Браузер: в CI ставится `npx playwright install chromium`. В управляемой
// среде Claude Code браузер предустановлен — путь передаётся через
// PLAYWRIGHT_CHROMIUM_EXECUTABLE (см. scripts, README ниже), чтобы Playwright
// не пытался его докачивать.

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
})
