'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface DocumentCategory {
  id: string
  code: string
  name_ru: string
  sort_order: number
}

interface DocumentType {
  id: string
  category_id: string
  code: string
  name_ru: string
  description: string | null
  is_required: boolean
  sort_order: number
}

interface PersonDocument {
  id: string
  document_type_id: string
  status: 'pending' | 'received' | 'verified' | 'rejected' | 'expired'
  file_url: string | null
  notes: string | null
  received_at: string | null
  verified_at: string | null
}

interface Props {
  personId: string
  canManage: boolean
}

const STATUS_ICON: Record<string, string> = {
  pending:  '⬜',
  received: '📩',
  verified: '✅',
  rejected: '❌',
  expired:  '⏰',
}

const STATUS_COLOR: Record<string, string> = {
  pending:  '#9CA3AF',
  received: '#3B82F6',
  verified: '#10B981',
  rejected: '#EF4444',
  expired:  '#F59E0B',
}

export default function DocumentsTab({ personId, canManage }: Props) {
  const t = useTranslations('education')
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [types, setTypes] = useState<DocumentType[]>([])
  const [docs, setDocs] = useState<PersonDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, typeRes, docRes] = await Promise.all([
        fetch('/api/documents/categories'),
        fetch('/api/documents/types'),
        fetch(`/api/documents/person/${personId}`),
      ])
      if (catRes.ok) setCategories(await catRes.json() as DocumentCategory[])
      if (typeRes.ok) setTypes(await typeRes.json() as DocumentType[])
      if (docRes.ok) setDocs(await docRes.json() as PersonDocument[])
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => { load() }, [load])

  async function setStatus(documentTypeId: string, status: string) {
    setSaving(documentTypeId)
    setError('')
    try {
      const res = await fetch(`/api/documents/person/${personId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_type_id: documentTypeId, status }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? t('docs_error', 'Ошибка'))
        return
      }
      await load()
    } finally {
      setSaving(null)
    }
  }

  const docMap = new Map(docs.map(d => [d.document_type_id, d]))

  const received = docs.filter(d => d.status === 'received' || d.status === 'verified').length
  const total = types.length
  const pct = total > 0 ? Math.round((received / total) * 100) : 0

  if (loading) {
    return <div style={{ color: '#9CA3AF', fontSize: 13, padding: '12px 0' }}>{t('docs_loading', 'Загрузка документов…')}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
          <span>{t('docs_progress_label', 'Получено документов')}</span>
          <span style={{ fontWeight: 600 }}>{received} / {total}</span>
        </div>
        <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#10B981', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>
      )}

      {/* Grouped by category */}
      {categories.map(cat => {
        const catTypes = types.filter(t => t.category_id === cat.id)
        if (catTypes.length === 0) return null
        return (
          <div key={cat.id}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {cat.name_ru}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {catTypes.map(dt => {
                const pd = docMap.get(dt.id)
                const status = pd?.status ?? 'pending'
                const isSaving = saving === dt.id

                return (
                  <div key={dt.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: '#fff', border: '1px solid #E5E7EB',
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{STATUS_ICON[status]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#1F2937', fontWeight: dt.is_required ? 500 : 400 }}>
                          {dt.name_ru}
                        </span>
                        {dt.is_required && (
                          <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>*</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: STATUS_COLOR[status], fontWeight: 500 }}>
                        {t(`docs_status_${status}`, status)}
                      </span>
                    </div>
                    {canManage && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {status !== 'received' && status !== 'verified' && (
                          <button
                            onClick={() => setStatus(dt.id, 'received')}
                            disabled={isSaving}
                            title={t('docs_action_mark_received', 'Отметить как получен')}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 4,
                              border: '1px solid #D1D5DB', background: '#F9FAFB',
                              color: '#374151', cursor: isSaving ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? '…' : t('docs_status_received', 'Получен')}
                          </button>
                        )}
                        {status === 'received' && (
                          <button
                            onClick={() => setStatus(dt.id, 'verified')}
                            disabled={isSaving}
                            title={t('docs_action_verify_title', 'Подтвердить документ')}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 4,
                              border: '1px solid #10B981', background: '#ECFDF5',
                              color: '#065F46', cursor: isSaving ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? '…' : t('docs_action_verify', 'Подтвердить')}
                          </button>
                        )}
                        {(status === 'received' || status === 'verified') && (
                          <button
                            onClick={() => setStatus(dt.id, 'rejected')}
                            disabled={isSaving}
                            title={t('docs_action_reject_title', 'Отклонить документ')}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 4,
                              border: '1px solid #FCA5A5', background: '#FEF2F2',
                              color: '#991B1B', cursor: isSaving ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? '…' : t('docs_action_reject', 'Отклонить')}
                          </button>
                        )}
                        {status === 'pending' && (
                          <button
                            onClick={() => setStatus(dt.id, 'expired')}
                            disabled={isSaving}
                            title={t('docs_action_mark_expired', 'Отметить как просроченный')}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 4,
                              border: '1px solid #FCD34D', background: '#FFFBEB',
                              color: '#92400E', cursor: isSaving ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? '…' : t('docs_status_expired', 'Просрочен')}
                          </button>
                        )}
                        {status !== 'pending' && status !== 'received' && status !== 'verified' && (
                          <button
                            onClick={() => setStatus(dt.id, 'pending')}
                            disabled={isSaving}
                            title={t('docs_action_reset_title', 'Сбросить статус')}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 4,
                              border: '1px solid #D1D5DB', background: '#F9FAFB',
                              color: '#6B7280', cursor: isSaving ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSaving ? '…' : t('docs_action_reset', 'Сброс')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {types.length === 0 && (
        <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>{t('docs_empty', 'Типы документов не настроены')}</div>
      )}
    </div>
  )
}
