'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { Icon } from '@/components/ui/Icon'

/**
 * Ссылка «פתח קובץ» на сданную מטלה: по клику берёт свежую подписанную ссылку
 * у /api/education/submissions/[id]/file и открывает её в новой вкладке.
 */
export default function SubmissionLink({ submissionId, fileName }: { submissionId: string; fileName: string }) {
  const t = useTranslations('education.courses')
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true)
    // Вкладку открываем синхронно (иначе браузер блокирует всплывающее окно).
    const win = window.open('', '_blank')
    try {
      const r = await fetch(`/api/education/submissions/${submissionId}/file`)
      const b = await r.json().catch(() => ({}))
      if (!r.ok || !b.url) {
        win?.close()
        toast(b.error ?? t('file_open_failed'), 'error')
        return
      }
      if (win) win.location.href = b.url
      else window.location.href = b.url
    } catch {
      win?.close()
      toast(t('file_open_failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      title={fileName}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
        color: 'var(--accent-strong, var(--accent))', textDecoration: 'underline', maxWidth: 220,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      <Icon name="paperclip" /> {fileName}
    </button>
  )
}
