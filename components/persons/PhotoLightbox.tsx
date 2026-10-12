'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'

/**
 * Увеличенное фото профиля — как фото контакта в WhatsApp: имя сверху,
 * фото во всю ширину. Закрывается крестиком, кликом по фону и Escape.
 */
export function PhotoLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const tc = useTranslations('common')
  return (
    <Modal onClose={onClose} closeOnBackdrop maxWidth={480} ariaLabel={name} padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <button
          onClick={onClose}
          aria-label={tc('close')}
          className="icon-ghost rounded-lg"
          style={{ width: 32, height: 32, flexShrink: 0, color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        style={{ display: 'block', width: '100%', maxHeight: '75vh', objectFit: 'contain', background: '#000' }}
      />
    </Modal>
  )
}
