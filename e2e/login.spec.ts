import { test, expect } from '@playwright/test'

// Дымовой тест страницы входа. Не требует БД — проверяет, что приложение
// вообще поднялось и отдаёт форму логина. Селекторы стабильные (id/атрибуты),
// без привязки к переведённому тексту, чтобы не ломаться от смены языка.
test.describe('Страница входа', () => {
  test('форма логина отрисована', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeVisible()
    // Кнопка заблокирована, пока оба поля пусты.
    await expect(submit).toBeDisabled()
  })

  test('кнопка разблокируется после заполнения полей', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('user@example.com')
    await page.locator('#password').fill('somepassword')
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test('защищённый раздел без входа редиректит на /login', async ({ page }) => {
    await page.goto('/dashboard/finance')
    await expect(page).toHaveURL(/\/login/)
  })
})
