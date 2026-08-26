'use client'

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { landingRouteForRoles } from '@/lib/auth/landing'
import { SubmitButton } from '@/components/ui/SubmitButton'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Явный ?from (пришёл со страницы под гейтом) уважаем; иначе — посадка по роли.
  const explicitFrom = searchParams.get('from')
  const t = useTranslations('auth')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? t('error_login_failed'))
        return
      }

      router.push(explicitFrom || landingRouteForRoles(data.roles))
      router.refresh()
    } catch {
      setError(t('error_connection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">{t('heading')}</h2>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('password')}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 pe-11 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? t('hide_password') : t('show_password')}
              title={showPassword ? t('hide_password') : t('show_password')}
              className="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showPassword
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                  : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
              </svg>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !email || !password}
          loadingLabel={t('logging_in')}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {t('login')}
        </SubmitButton>

      </form>

      {/* Вход студентки — ОТДЕЛЬНЫЙ портал (student_credentials, не person_accounts).
          Без этой ссылки студентки пытались войти здесь и получали «аккаунт
          заблокирован» (это staff-логин). */}
      <div className="mt-6 pt-5 border-t border-gray-100 text-center">
        <a
          href="/portal/login"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          {t('student_portal_link')}
        </a>
      </div>
    </div>
  )
}
