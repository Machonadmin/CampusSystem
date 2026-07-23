'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'

interface Signature {
  signer_name: string
  signer_role_code: string | null
  signed_via: string
  signature_kind: 'typed' | 'drawn' | string
  typed_name: string | null
  image_url: string | null
  final_code: string | null
  signed_at: string
}
interface StageSig {
  stage_instance_id: string
  stage_code: string
  stage_name: string
  required_role_code: string | null
  status: string
  final_code: string | null
  completed_at: string | null
  note: string | null
  signatures: Signature[]
}

/**
 * Панель «Подписи и утверждения» на карточке абитуриентки/студентки. Показывает
 * по каждому этапу приёма, кто подписал (имя, роль, тип), решение и саму
 * подпись. Руководитель видит ВЕСЬ набор — независимо от того, какой этап
 * подписывал сам. Рендерит null, если процесса приёма нет (напр. лид).
 */
export default function StageSignatures({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education')
  const { lang } = useLang()

  const [stages, setStages] = useState<StageSig[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflow/signatures?journey_id=${encodeURIComponent(journeyId)}`)
      if (!res.ok) { setLoaded(true); return }
      const b = await res.json()
      setStages(b.stages ?? [])
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  // Нет процесса приёма → нечего показывать (роль-гейта нет только у лида).
  if (!loaded || stages.length === 0) return null

  // Показываем только ролевые этапы приёма (у них есть подпись/подписант).
  const roleStages = stages.filter(s => s.required_role_code)
  if (roleStages.length === 0) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{t('signatures.title')}</h3>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{t('signatures.subtitle')}</div>

      <div style={{ display: 'grid', gap: 10 }}>
        {roleStages.map(st => {
          const stageName = t(`acceptance_stages.${st.stage_code}`, st.stage_name)
          const decision = st.final_code ? t(`acceptance_finals.${st.final_code}`, st.final_code) : null
          const positive = ['approved', 'admitted', 'admitted_conditional'].includes(st.final_code ?? '')
          return (
            <div key={st.stage_instance_id} style={{ border: '1px solid var(--surface-2)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{stageName}</div>
                {decision ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                    background: positive ? '#ECFDF5' : '#FEF2F2',
                    color: positive ? '#047857' : '#B91C1C',
                  }}>
                    {decision}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                    {t('signatures.pending')}
                  </span>
                )}
              </div>

              {st.note && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text)', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px' }}>
                  {st.note}
                </div>
              )}

              {st.signatures.length > 0 && (
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  {st.signatures.map((sig, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)' }}>
                          <span style={{ color: 'var(--text-faint)' }}>{t('signatures.signed_by')}: </span>
                          <strong>{sig.signer_name}</strong>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {t('signatures.signed_at')}: {formatDateTime(sig.signed_at, lang)}
                          {sig.signed_via === 'override' ? ` · ${t('signatures.via_override')}` : ''}
                        </div>
                      </div>

                      {/* Сама подпись */}
                      <div style={{ minWidth: 140 }}>
                        {sig.signature_kind === 'drawn' && sig.image_url ? (
                          <a href={sig.image_url} target="_blank" rel="noopener" title={t('signatures.view')}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sig.image_url}
                              alt={t('signatures.drawn')}
                              style={{ maxHeight: 56, maxWidth: 200, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
                            />
                          </a>
                        ) : sig.signature_kind === 'typed' && sig.typed_name ? (
                          <div style={{
                            fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic',
                            fontSize: 20, color: 'var(--text)', borderBottom: '1px solid var(--border-strong)',
                            paddingBottom: 2, display: 'inline-block',
                          }}>
                            {sig.typed_name}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
