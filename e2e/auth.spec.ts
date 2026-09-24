import { test, expect } from '@playwright/test'

// Проверяет реальный путь аутентификации против живой БД (staging):
//   - неверные данные → API отвечает не-2xx, вход не происходит
//   - если заданы E2E_USER / E2E_PASS — полный вход до /dashboard
// Второй тест пропускается, когда учётка не передана (например, до создания
// staging), чтобы CI не падал впустую.

test.describe('Аутентификация', () => {
  test('неверные данные → ошибка входа, без перехода в кабинет', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('nobody@example.com')
    await page.locator('#password').fill('definitely-wrong-password')

    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login')),
      page.locator('button[type="submit"]').click(),
    ])

    expect(resp.ok()).toBe(false)
    await expect(page).not.toHaveURL(/\/dashboard/)
  })

  test('верные данные → вход в кабинет', async ({ page }) => {
    const email = process.env.E2E_USER
    const password = process.env.E2E_PASS
    test.skip(!email || !password, 'E2E_USER / E2E_PASS не заданы — пропуск полного входа')

    await page.goto('/login')
    await page.locator('#email').fill(email!)
    await page.locator('#password').fill(password!)
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })
})
