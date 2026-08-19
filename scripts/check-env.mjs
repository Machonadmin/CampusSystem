#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-env.mjs — предзапусковая проверка переменных окружения.
//
// Запускать В ТОМ окружении, которое проверяем (локально с prod-переменными,
// или как шаг перед деплоем). Проверяет обязательные переменные, силу
// JWT_SECRET и печатает отчёт. Код возврата: 1, если чего-то обязательного не
// хватает или оно невалидно — годится как gate в CI/пайплайне.
//
// НЕ печатает значения секретов — только присутствие/длину.
// ─────────────────────────────────────────────────────────────────────────────

const INSECURE_JWT = 'change-me-in-production-min-32-chars!!'
const isProd = process.env.NODE_ENV === 'production'

let hardFail = false
const line = (icon, label, note) => console.log(`  ${icon}  ${label}${note ? ' — ' + note : ''}`)

console.log('\n── Проверка окружения CampusSystem ──\n')

// ── Обязательные ──
console.log('ОБЯЗАТЕЛЬНЫЕ:')
{
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url) line('✅', 'NEXT_PUBLIC_SUPABASE_URL', 'set')
  else { line('❌', 'NEXT_PUBLIC_SUPABASE_URL', 'MISSING'); hardFail = true }
}
{
  const secret = process.env.SUPABASE_SECRET_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (secret) line('✅', 'SUPABASE_SECRET_KEY', 'set (service role)')
  else if (anon) line('⚠️ ', 'SUPABASE_SECRET_KEY', 'MISSING — используется ANON key (сервер должен работать под service role!)')
  else { line('❌', 'SUPABASE_SECRET_KEY / ANON', 'both MISSING'); hardFail = true }
}
{
  const s = process.env.JWT_SECRET
  if (!s) { line('❌', 'JWT_SECRET', 'MISSING'); hardFail = true }
  else if (s === INSECURE_JWT) { line('❌', 'JWT_SECRET', 'равен небезопасному ДЕФОЛТУ — сгенерируйте новый'); hardFail = true }
  else if (s.length < 32) { line('❌', 'JWT_SECRET', `слишком короткий (${s.length} < 32)`); hardFail = true }
  else line('✅', 'JWT_SECRET', `set (${s.length} chars)`)
}

// ── Рекомендуемые ──
console.log('\nРЕКОМЕНДУЕМЫЕ:')
line(process.env.CRON_SECRET ? '✅' : '⚠️ ', 'CRON_SECRET', process.env.CRON_SECRET ? 'set' : 'не задан — cron-эндпоинт открыт (в PUBLIC_API_PREFIXES)')

// ── Опциональные (мониторинг) ──
console.log('\nОПЦИОНАЛЬНЫЕ (Sentry — без них мониторинг выключен):')
line(process.env.NEXT_PUBLIC_SENTRY_DSN ? '✅' : '➖', 'NEXT_PUBLIC_SENTRY_DSN', process.env.NEXT_PUBLIC_SENTRY_DSN ? 'set (клиентские ошибки)' : 'не задан')
line(process.env.SENTRY_DSN ? '✅' : '➖', 'SENTRY_DSN', process.env.SENTRY_DSN ? 'set (серверные ошибки)' : 'не задан')
line(process.env.SENTRY_AUTH_TOKEN ? '✅' : '➖', 'SENTRY_AUTH_TOKEN', process.env.SENTRY_AUTH_TOKEN ? 'set (source maps)' : 'не задан — source maps не выгружаются')

console.log(`\nNODE_ENV = ${process.env.NODE_ENV ?? '(unset)'}${isProd ? '  [PRODUCTION]' : ''}`)
console.log('\nНАПОМИНАНИЕ (проверить вручную в Supabase → Storage):')
console.log("  • приватный бакет 'documents' существует и НЕ публичный.")
console.log("  • SQL:  select id, public from storage.buckets where id = 'documents';")

if (hardFail) {
  console.log('\n❌ Есть НЕзаполненные/невалидные ОБЯЗАТЕЛЬНЫЕ переменные — не запускать в прод.\n')
  process.exit(1)
}
console.log('\n✅ Все обязательные переменные на месте.\n')
