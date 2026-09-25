'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import type { PersonLinkView, PersonLinkAction } from '@/lib/persons/record-link'

/**
 * Решение №11: связь контакта/донора с центральной персоной.
 *   • 'suggested' (+ canManage): «התאמה אפשרית: <имя, маска телефона> — אשר / לא אותו אדם»;
 *   • 'linked': имя персоны ссылкой на /dashboard/persons/[id] — только если
 *     сервер отдал person (у зрителя есть persons.view); иначе — общая пометка
 *     «связан с базой людей» без имени и ссылки. canManage — кнопка «отвязать».
 * Решение уходит в POST /api/{contacts|sponsors}/[id]/person-link.
 */
export function PersonLinkBanner({
  entity, recordId, link, canManage, onChange,
}: {
  entity: 'contacts' | 'sponsors'
  recordId: string
  link: PersonLinkView | null | undefined
  canManage: boolean
  onChange: (next: PersonLinkView) => void
}) {
  const t = useTranslations('persons')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!link || !link.status) return null

  async function act(action: PersonLinkAction) {
    if (action === 'unlink' && !(await confirmDialog({ message: t('person_link.unlink_confirm'), tone: 'danger' }))) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/${entity}/${recordId}/person-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setError(b.error ?? t('person_link.action_error')); return }
      if (b.person_link) onChange(b.person_link as PersonLinkView)
    } catch {
      setError(t('person_link.action_error'))
    } finally {
      setBusy(false)
    }
  }

  if (link.status === 'suggested') {
    if (!canManage || !link.candidate) return null
    const who = [link.candidate.name, link.candidate.phone_masked].filter(Boolean).join(', ')
    return (
      <div role="status" style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: 'var(--surface-2)', border: '1px solid var(--warn)', borderRadius: 10,
        padding: '10px 14px', fontSize: 13, color: 'var(--text)',
      }}>
        <span>
          <b>{t('person_link.possible_match')}:</b> <bdi>{who}</bdi>
        </span>
        <span style={{ display: 'flex', gap: 8, marginInlineStart: 'auto' }}>
          <Button onClick={() => act('confirm')} disabled={busy}>{t('person_link.confirm')}</Button>
          <Button onClick={() => act('reject')} disabled={busy}>{t('person_link.reject')}</Button>
        </span>
        {error && <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
      </div>
    )
  }

  if (link.status === 'linked') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
        {link.person ? (
          <span>
            {t('person_link.linked_to')}:{' '}
            <Link href={`/dashboard/persons/${link.person.id}`} style={{ color: 'var(--violet)', fontWeight: 600 }}>
              <bdi>{link.person.name}</bdi>
            </Link>
          </span>
        ) : (
          <span style={{ color: 'var(--text-faint)' }}>{t('person_link.linked_generic')}</span>
        )}
        {canManage && (
          <Button onClick={() => act('unlink')} disabled={busy}>{t('person_link.unlink')}</Button>
        )}
        {error && <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
      </div>
    )
  }

  return null
}
