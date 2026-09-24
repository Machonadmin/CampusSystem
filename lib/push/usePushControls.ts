'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { enablePush, getPushState, registerSW, sendTestPush, syncPush, type PushState } from '@/lib/push/client'
import { toastError, toastSuccess } from '@/components/ui/toast'

/**
 * Состояние и действия пушей на телефон для ЭТОГО устройства — общие для
 * колокольчика в шапке и экрана «הפרופיל שלי», чтобы логика и тексты не
 * расходились между двумя местами.
 *
 * При монтировании регистрирует service worker, тихо сверяет подписку с
 * сервером (если разрешение уже есть) и выясняет, подписано ли устройство.
 */
export function usePushControls() {
  const t = useTranslations('notifications')
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    let alive = true
    registerSW().then(() => syncPush()).then(() => getPushState()).then(s => { if (alive) setPushState(s) })
    return () => { alive = false }
  }, [])

  async function onEnablePush() {
    setPushBusy(true)
    try {
      const reason = await enablePush()
      if (reason === 'ok') { setPushState('subscribed'); toastSuccess(t('push_enabled')) }
      else {
        setPushState(await getPushState())
        // Конкретная причина, а не общий провал: «денай» и «нужна установка»
        // объясняются текстом рядом с кнопкой, для остальных — тост.
        if (reason !== 'denied' && reason !== 'ios-needs-install') toastError(t('push_failed'))
      }
    } finally {
      setPushBusy(false)
    }
  }

  async function onTestPush() {
    setPushBusy(true)
    try {
      const r = await sendTestPush()
      if (!r || r.noKeys) toastError(t('push_test_failed').replace('{code}', '—'))
      else if (r.devices === 0) toastError(t('push_test_no_devices'))
      else if (r.sent > 0) toastSuccess(t('push_test_sent'))
      else toastError(t('push_test_failed').replace('{code}', r.failed.join(', ') || '—'))
    } finally {
      setPushBusy(false)
    }
  }

  return { pushState, pushBusy, onEnablePush, onTestPush }
}
