import { evaluateCronAuth } from '@/lib/cron/auth'

/**
 * Авторизация /api/agent/feedback — входа для Claude, который раз в день
 * забирает новые замечания сотрудников и приносит их владельцу. FAIL-CLOSED,
 * та же проверка, что у cron (lib/cron/auth.ts), но свой секрет:
 * FEEDBACK_AGENT_TOKEN. Не задан на сервере → 503, вход закрыт.
 *
 * Токен даёт ТОЛЬКО чтение замечаний и смену их статуса/ответа — ничего больше
 * в системе через него сделать нельзя.
 */
export function agentAuthGuard(request: { headers: { get(name: string): string | null } }): Response | null {
  const decision = evaluateCronAuth(process.env.FEEDBACK_AGENT_TOKEN, request.headers.get('authorization'))
  if (decision.ok) return null
  if (decision.reason === 'not_configured') {
    console.error('[agent/feedback] refused: FEEDBACK_AGENT_TOKEN is not configured on the server')
    return Response.json(
      { error: 'FEEDBACK_AGENT_TOKEN is not configured on the server', reason: decision.reason },
      { status: decision.status },
    )
  }
  return Response.json({ error: 'unauthorized', reason: decision.reason }, { status: decision.status })
}
