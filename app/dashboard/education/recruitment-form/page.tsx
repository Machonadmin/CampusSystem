'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import type { PublicFormConfig, BuiltinFieldKey, CustomField, CustomFieldType } from '@/lib/public/form-config'

interface Program { id: string; name: string; institution_name: string | null }

// Маркетинговые тексты, которые можно переопределить (ключи apply.*). Дефолт
// показываем как подпись/плейсхолдер — редактор правит текущий язык интерфейса.
const TEXT_KEYS = [
  'hero_eyebrow', 'hero_tagline', 'register_heading', 'form_subtitle',
  'programs_heading', 'programs_note',
  'value1_title', 'value1_body', 'value2_title', 'value2_body', 'value3_title', 'value3_body',
]

// Порядок и метки встроенных полей (ключ i18n education.recruitment_form).
const FIELD_ROWS: { key: BuiltinFieldKey; labelKey: string }[] = [
  { key: 'last_name', labelKey: 'f_last_name' },
  { key: 'email', labelKey: 'f_email' },
  { key: 'birth_date', labelKey: 'f_birth_date' },
  { key: 'city', labelKey: 'f_city' },
  { key: 'direction', labelKey: 'f_direction' },
  { key: 'applicant_type', labelKey: 'f_applicant_type' },
  { key: 'comment', labelKey: 'f_comment' },
]

export default function RecruitmentFormSettingsPage() {
  const t = useTranslations('education.recruitment_form')
  const tNav = useTranslations('navigation')
  const ta = useTranslations('apply')
  const { lang } = useLang()
  const accent = getModuleColor('education')

  const [cfg, setCfg] = useState<PublicFormConfig | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/education/recruitment/form-config'),
        fetch('/api/public/programs'),
      ])
      if (!cRes.ok) { setError(t('load_error')); return }
      setCfg(await cRes.json())
      setPrograms(pRes.ok ? await pRes.json() : [])
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  function setField(key: BuiltinFieldKey, patch: { visible?: boolean; required?: boolean }) {
    setCfg(prev => {
      if (!prev) return prev
      return {
        ...prev,
        fields: prev.fields.map(f => f.key === key
          ? {
              ...f,
              visible: patch.visible ?? f.visible,
              required: patch.required ?? f.required,
              // скрытое поле не может быть обязательным
              ...(patch.visible === false ? { required: false } : {}),
            }
          : f),
      }
    })
  }

  function setDirMode(mode: 'all' | 'subset') {
    setCfg(prev => prev ? { ...prev, directions: { ...prev.directions, mode } } : prev)
  }
  function toggleDir(id: string) {
    setCfg(prev => {
      if (!prev) return prev
      const has = prev.directions.ids.includes(id)
      return {
        ...prev,
        directions: {
          ...prev.directions,
          ids: has ? prev.directions.ids.filter(x => x !== id) : [...prev.directions.ids, id],
        },
      }
    })
  }

  // Переопределение текста на ТЕКУЩЕМ языке интерфейса; пустое значение убирает
  // override (возврат к дефолтному переводу).
  function setText(key: string, value: string) {
    setCfg(prev => {
      if (!prev) return prev
      const langTexts: Record<string, string> = { ...(prev.texts[lang] ?? {}) }
      if (value.trim()) langTexts[key] = value
      else delete langTexts[key]
      const texts = { ...prev.texts }
      if (Object.keys(langTexts).length) texts[lang] = langTexts
      else delete texts[lang]
      return { ...prev, texts }
    })
  }

  // ── Кастомные поля ──
  function nextCustomKey(): string {
    const nums = (cfg?.customFields ?? []).map(f => Number(/^c(\d+)$/.exec(f.key)?.[1] ?? '0'))
    return `c${Math.max(0, ...nums) + 1}`
  }
  function addCustom() {
    setCfg(prev => prev ? {
      ...prev,
      customFields: [...prev.customFields, {
        key: nextCustomKey(), type: 'text', label: { he: '', ru: '', en: '' }, options: [], required: false, visible: true,
      }],
    } : prev)
  }
  function updateCustom(key: string, patch: Partial<CustomField>) {
    setCfg(prev => prev ? { ...prev, customFields: prev.customFields.map(f => f.key === key ? { ...f, ...patch } : f) } : prev)
  }
  function setCustomLabel(key: string, value: string) {
    setCfg(prev => prev ? {
      ...prev,
      customFields: prev.customFields.map(f => f.key === key
        ? { ...f, label: { ...f.label, [lang]: value } as { he: string; ru: string; en: string } }
        : f),
    } : prev)
  }
  function removeCustom(key: string) {
    setCfg(prev => prev ? { ...prev, customFields: prev.customFields.filter(f => f.key !== key) } : prev)
  }

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const res = await fetch('/api/education/recruitment/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (!res.ok) { toast(t('save_error'), 'error'); return }
      setCfg(await res.json())
      toast(t('saved'), 'success')
    } catch {
      toast(t('save_error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const fieldOf = (key: BuiltinFieldKey) => cfg?.fields.find(f => f.key === key)

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>{t('title')}</h1>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : error ? (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>
      ) : cfg ? (
        <>
          {/* ── Поля формы ── */}
          <section style={card}>
            <h2 style={sectionTitle}>{t('section_fields')}</h2>
            <p style={sectionNote}>{t('section_fields_note')}</p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ ...gridRow, background: 'var(--surface-2)', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>{t('col_field')}</span>
                <span style={{ textAlign: 'center' }}>{t('col_show')}</span>
                <span style={{ textAlign: 'center' }}>{t('col_required')}</span>
              </div>
              {FIELD_ROWS.map(row => {
                const f = fieldOf(row.key)
                return (
                  <div key={row.key} style={{ ...gridRow, borderTop: '1px solid var(--surface-2)' }}>
                    <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{t(row.labelKey)}</span>
                    <label style={cellCenter}>
                      <input type="checkbox" checked={!!f?.visible} onChange={e => setField(row.key, { visible: e.target.checked })} />
                    </label>
                    <label style={cellCenter}>
                      <input type="checkbox" checked={!!f?.required} disabled={!f?.visible} onChange={e => setField(row.key, { required: e.target.checked })} />
                    </label>
                  </div>
                )
              })}
            </div>
            <p style={{ ...sectionNote, marginTop: 10, marginBottom: 0, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <svg style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              <span>{t('core_note')}</span>
            </p>
          </section>

          {/* ── Направления ── */}
          <section style={card}>
            <h2 style={sectionTitle}>{t('section_directions')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <label style={radioRow}>
                <input type="radio" name="dirmode" checked={cfg.directions.mode === 'all'} onChange={() => setDirMode('all')} />
                <span>{t('dir_all')}</span>
              </label>
              <label style={radioRow}>
                <input type="radio" name="dirmode" checked={cfg.directions.mode === 'subset'} onChange={() => setDirMode('subset')} />
                <span>{t('dir_subset')}</span>
              </label>
            </div>
            {cfg.directions.mode === 'subset' && (
              <div style={{ marginTop: 12 }}>
                <p style={sectionNote}>{t('dir_subset_note')}</p>
                {programs.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('dir_empty')}</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {programs.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: cfg.directions.ids.includes(p.id) ? 'var(--accent-tint)' : 'var(--surface)' }}>
                        <input type="checkbox" checked={cfg.directions.ids.includes(p.id)} onChange={() => toggleDir(p.id)} />
                        <span style={{ color: 'var(--text)' }}>{p.name}{p.institution_name ? ` · ${p.institution_name}` : ''}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Маркетинговые тексты ── */}
          <section style={card}>
            <h2 style={sectionTitle}>{t('section_texts')}</h2>
            <p style={sectionNote}>{t('section_texts_note')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TEXT_KEYS.map(key => {
                const def = ta(key)
                const val = cfg.texts[lang]?.[key] ?? ''
                const long = key.endsWith('_body') || key === 'programs_note' || key === 'hero_tagline'
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{def}</span>
                    {long ? (
                      <textarea value={val} placeholder={def} onChange={e => setText(key, e.target.value)} rows={2} style={textInput} />
                    ) : (
                      <input value={val} placeholder={def} onChange={e => setText(key, e.target.value)} style={textInput} />
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Кастомные поля ── */}
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={sectionTitle}>{t('section_custom')}</h2>
              <button onClick={addCustom} style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 12px', border: `1px solid ${accent}`, borderRadius: 8, background: 'var(--surface)', color: accent, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t('custom_add')}
              </button>
            </div>
            <p style={sectionNote}>{t('section_custom_note')}</p>
            {cfg.customFields.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('custom_empty')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cfg.customFields.map(f => (
                  <div key={f.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={(f.label as Record<string, string>)[lang] ?? ''} placeholder={t('custom_label')}
                        onChange={e => setCustomLabel(f.key, e.target.value)} style={{ ...textInput, flex: '1 1 220px' }} />
                      <select value={f.type} onChange={e => updateCustom(f.key, { type: e.target.value as CustomFieldType })} style={{ ...textInput, width: 'auto' }}>
                        <option value="text">{t('type_text')}</option>
                        <option value="textarea">{t('type_textarea')}</option>
                        <option value="select">{t('type_select')}</option>
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input type="checkbox" checked={f.required} onChange={e => updateCustom(f.key, { required: e.target.checked })} />
                        {t('custom_required')}
                      </label>
                      <button onClick={() => removeCustom(f.key)} style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 12px', border: '1px solid var(--danger)', borderRadius: 8, background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer' }}>
                        {t('custom_remove')}
                      </button>
                    </div>
                    {f.type === 'select' && (
                      <input value={f.options.join(', ')} placeholder={t('custom_options')}
                        onChange={e => updateCustom(f.key, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        style={textInput} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={save} disabled={saving} style={{ fontSize: 14, fontWeight: 600, padding: '10px 22px', border: 'none', borderRadius: 9, background: accent, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }
const sectionNote: React.CSSProperties = { fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 14px' }
const gridRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 90px 90px', alignItems: 'center', padding: '10px 14px' }
const cellCenter: React.CSSProperties = { display: 'flex', justifyContent: 'center', cursor: 'pointer' }
const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }
const textInput: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }
