import { Suspense } from 'react'
import { getCookieLocale } from '@/lib/i18n/locale'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import LoginForm from './LoginForm'

const messagesByLocale = { ru: ruMessages, he: heMessages, en: enMessages }

export default function LoginPage() {
  const t = messagesByLocale[getCookieLocale()].auth

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {t.campus_title}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{t.campus_subtitle}</p>
        </div>

        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex justify-center">
            <svg className="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        }>
          <LoginForm />
        </Suspense>

      </div>
    </div>
  )
}
