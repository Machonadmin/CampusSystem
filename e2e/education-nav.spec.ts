import { test, expect, type Page } from '@playwright/test'

// ─── E2E: навигация модуля «Учёба» (Layer 3) ─────────────────────────────────
//
// Блокирует регресс двух починок:
//   1. drill «Учёбы» держится в URL → браузерный «назад» спускается на уровень,
//      а НЕ выбрасывает на landing/главную (studies-nav / StudyTab / StudiesWorkspace).
//   2. /dashboard/education — настоящий ХАБ: пользователь с 2+ разделами видит
//      выбор (не прыгает на קבלה); одиночный раздел форвардится сразу.
//
// Гоняется против ЖИВОГО backend (staging), как auth.spec.ts: логин берётся из
// E2E_USER / E2E_PASS. Без них — тест SKIP (не падает вхолостую). Основная учётка
// должна быть управленческой (superadmin/менеджер) с доступом к 2+ разделам
// образования и к рельсу «Учёбы». Одиночный раздел проверяется отдельной учёткой
// E2E_SINGLE_USER / E2E_SINGLE_PASS (skip, если не задана).

const USER = process.env.E2E_MULTI_USER || process.env.E2E_USER
const PASS = process.env.E2E_MULTI_PASS || process.env.E2E_PASS
const SINGLE_USER = process.env.E2E_SINGLE_USER
const SINGLE_PASS = process.env.E2E_SINGLE_PASS

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
}

// «Назад» в SPA (History API) — без перезагрузки документа; commit достаточно,
// затем ждём смену URL через poll в expect.
async function back(page: Page) {
  await page.goBack({ waitUntil: 'commit' }).catch(() => { /* SPA back: нет ответа навигации */ })
}

test.describe('Учёба: «назад» шагает по разделам, не прыгает на landing/главную', () => {
  test.skip(!USER || !PASS, 'E2E_USER / E2E_PASS не заданы — нужен живой backend + управленческая учётка')

  test('drill рельса: каждый Back — на уровень вниз, не на landing и не на /dashboard', async ({ page }) => {
    await login(page, USER!, PASS!)
    await page.goto('/dashboard/education/studies')

    const semesterGroups = page.getByTestId('study-rail-semester_groups')
    await expect(semesterGroups).toBeVisible({ timeout: 15_000 })

    // landing → semester_groups (push истории)
    await semesterGroups.click()
    await expect(page).toHaveURL(/[?&]sec=semester_groups/)

    // semester_groups → students (push истории)
    await page.getByTestId('study-rail-students').click()
    await expect(page).toHaveURL(/[?&]sec=students/)

    // Back №1 → обратно на semester_groups (НЕ на landing/главную)
    await back(page)
    await expect(page).toHaveURL(/[?&]sec=semester_groups/)
    await expect(page).toHaveURL(/\/dashboard\/education\/studies/)

    // Back №2 → на landing «Учёбы» (sec отсутствует), всё ещё studies и НЕ главная
    await back(page)
    await expect(page).toHaveURL(/\/dashboard\/education\/studies(\?|$)/)
    await expect(page).not.toHaveURL(/[?&]sec=/)
    await expect(page).not.toHaveURL(/\/dashboard(\/)?$/)
  })
})

test.describe('Хаб «חינוך»', () => {
  test.skip(!USER || !PASS, 'E2E_USER / E2E_PASS не заданы')

  test('2+ доступных раздела → показывает хаб с выбором, без прыжка на קבלה/главную', async ({ page }) => {
    await login(page, USER!, PASS!)
    await page.goto('/dashboard/education')

    // Остаёмся на хабе, а не редиректим в конкретный раздел.
    await expect(page).toHaveURL(/\/dashboard\/education(\?|$)/)
    await expect(page.getByTestId('edu-hub')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-testid^="edu-hub-card-"]').first()).toBeVisible()

    // Явно НЕ ушли на приём и не выпали на главную.
    await expect(page).not.toHaveURL(/\/dashboard\/education\/admission/)
    await expect(page).not.toHaveURL(/\/dashboard(\/)?$/)
  })
})

test.describe('Хаб: одиночный раздел форвардит сразу', () => {
  test.skip(!SINGLE_USER || !SINGLE_PASS, 'E2E_SINGLE_USER / E2E_SINGLE_PASS не заданы — нужна учётка ровно с одним разделом')

  test('один доступный раздел → сразу в него, хаб не показывается', async ({ page }) => {
    await login(page, SINGLE_USER!, SINGLE_PASS!)
    await page.goto('/dashboard/education')

    await expect(page).toHaveURL(/\/dashboard\/education\/(recruitment|admission|studies)/, { timeout: 15_000 })
    await expect(page.getByTestId('edu-hub')).toHaveCount(0)
  })
})
