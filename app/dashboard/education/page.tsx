'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  profile_id: string
  person_id: string
  full_name: string
  email: string | null
  phones: string[]
  photo_url: string | null
  referral_source: string | null
  application_date: string | null
  interests: { institution: string; direction: string | null }[]
}

interface PersonResult { id: string; full_name: string; email: string | null }
interface Interest { institution: string; direction: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const INSTITUTIONS = ['university', 'touro', 'college', 'school', 'emuna', 'other'] as const
const INST_LABELS: Record<string, string> = {
  university: 'Университет', touro: 'Touro', college: 'Колледж',
  school: 'Школа', emuna: 'Эмуна', other: 'Другое',
}
const SOURCES = [
  { value: 'website', label: 'Сайт' },
  { value: 'social', label: 'Соцсети' },
  { value: 'referral', label: 'Рекомендация' },
  { value: 'call', label: 'Звонок' },
  { value: 'exhibition', label: 'Выставка' },
  { value: 'other', label: 'Другое' },
]
const SOURCE_LABELS: Record<string, string> = Object.fromEntries(SOURCES.map(s => [s.value, s.label]))

const TABS = [
  { key: 'recruitment', label: 'Набор' },
  { key: 'admission',   label: 'Приём' },
  { key: 'study',       label: 'Учёба' },
] as const
type TabKey = typeof TABS[number]['key']

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}
function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Add lead modal ────────────────────────────────────────────────────────────

type ModalView = 'search' | 'new' | 'existing'

const MODAL_TABS = ['Личные данные', 'Контакты и адрес', 'Семья', 'Направления', 'Дополнительно']
const COUNTRIES = ['Израиль', 'Россия', 'США', 'Германия', 'Франция', 'Великобритания', 'Украина', 'Беларусь', 'Казахстан', 'Другая']

function AddLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [view, setView] = useState<ModalView>('search')
  const [selected, setSelected] = useState<PersonResult | null>(null)
  const [tabIdx, setTabIdx] = useState(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Tab 1 – Личные данные
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [hebrewName, setHebrewName] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [maritalStatus, setMaritalStatus] = useState('')
  const [citizenship, setCitizenship] = useState('')

  // Tab 2 – Контакты и адрес
  const [phones, setPhones] = useState<string[]>([''])
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [house, setHouse] = useState('')
  const [apartment, setApartment] = useState('')
  const [postalCode, setPostalCode] = useState('')

  // Tab 3 – Семья
  const [momName, setMomName] = useState('')
  const [momPhone, setMomPhone] = useState('')
  const [dadName, setDadName] = useState('')
  const [dadPhone, setDadPhone] = useState('')
  const [extraContacts, setExtraContacts] = useState<{ name: string; relation: string; phone: string; email: string }[]>([])

  // Tab 4 – Направления
  const [interests, setInterests] = useState<Interest[]>([{ institution: 'university', direction: '' }])

  // Tab 5 – Дополнительно
  const [source, setSource] = useState('')
  const [comment, setComment] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    clearTimeout(timerRef.current)
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(query)}`)
      if (res.ok) setResults(await res.json())
      setSearching(false)
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [query])

  function selectPerson(p: PersonResult) {
    setSelected(p); setView('existing'); setQuery(''); setResults([]); setTabIdx(0)
  }

  function goNext() {
    setError('')
    if (view === 'new') {
      if (tabIdx === 0 && !fullName.trim()) { setError('ФИО обязательно'); return }
      if (tabIdx === 1 && !phones.some(p => p.trim())) { setError('Введите хотя бы один телефон'); return }
    }
    setTabIdx(t => Math.min(t + 1, 4))
  }

  function goBack() { setError(''); setTabIdx(t => Math.max(t - 1, 0)) }

  function updateInterest(idx: number, field: keyof Interest, value: string) {
    setInterests(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        interests: interests.filter(i => i.institution),
        referral_source: source || undefined,
        comment: comment || undefined,
      }
      if (view === 'existing' && selected) {
        body.person_id = selected.id
      } else {
        if (!fullName.trim()) { setError('ФИО обязательно'); setSaving(false); return }
        const validPhones = phones.filter(p => p.trim())
        if (validPhones.length === 0) { setError('Телефон обязателен'); setSaving(false); return }
        body.full_name = fullName.trim()
        body.phone = validPhones[0]
        if (validPhones.length > 1) body.phones = validPhones
        if (email) body.email = email.trim()
        if (gender) body.gender = gender
        if (birthDate) body.birth_date = birthDate
        if (hebrewName) body.hebrew_name = hebrewName.trim()
        if (maritalStatus) body.marital_status = maritalStatus
        if (citizenship) body.citizenship = citizenship.trim()
        const addr = { country, city, street, house, apartment, postal_code: postalCode }
        if (Object.values(addr).some(v => v)) body.address = addr
        const familyData: Record<string, unknown> = {}
        if (momName || momPhone) familyData.mom = { name: momName, phone: momPhone }
        if (dadName || dadPhone) familyData.dad = { name: dadName, phone: dadPhone }
        const validContacts = extraContacts.filter(c => c.name || c.phone)
        if (validContacts.length > 0) familyData.contacts = validContacts
        if (Object.keys(familyData).length > 0) body.family = familyData
      }
      const res = await fetch('/api/education/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Ошибка')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block',
  }

  function renderTab() {
    if (view === 'existing' && tabIdx === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#2D3170', marginBottom: 12 }}>
            {initials(selected?.full_name ?? '')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2937' }}>{selected?.full_name}</div>
          {selected?.email && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{selected.email}</div>}
          <div style={{ marginTop: 14, fontSize: 12, color: '#9CA3AF', textAlign: 'center', maxWidth: 300 }}>
            Личные данные уже заполнены в профиле этого человека
          </div>
        </div>
      )
    }

    switch (tabIdx) {
      case 0:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', border: '2px dashed #D1D5DB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {photoPreview
                  ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 28, opacity: 0.25 }}>◯</span>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#2D3170', cursor: 'pointer', padding: '6px 14px', border: '1px solid #2D3170', borderRadius: 8, display: 'inline-block' }}>
                  Загрузить фото
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoPreview(URL.createObjectURL(f)) }} />
                </label>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Необязательно · JPG, PNG</div>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>ФИО *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванова Мария Ивановна" style={inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Имя на иврите</label>
              <input value={hebrewName} onChange={e => setHebrewName(e.target.value)} placeholder="מריה" style={{ ...inp, direction: 'rtl' }} />
            </div>
            <div>
              <label style={lbl}>Пол</label>
              <select value={gender} onChange={e => setGender(e.target.value)} style={inp}>
                <option value="">—</option>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Дата рождения</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Семейное положение</label>
              <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} style={inp}>
                <option value="">—</option>
                <option value="single">Не замужем</option>
                <option value="married">Замужем</option>
                <option value="divorced">Разведена</option>
                <option value="widowed">Вдова</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Гражданство</label>
              <input value={citizenship} onChange={e => setCitizenship(e.target.value)} placeholder="Израиль" style={inp} />
            </div>
          </div>
        )

      case 1:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Телефоны{view === 'new' ? ' *' : ''}</label>
                <button onClick={() => setPhones(prev => [...prev, ''])}
                  style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  + Добавить телефон
                </button>
              </div>
              {phones.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={p} onChange={e => setPhones(prev => prev.map((ph, pi) => pi === i ? e.target.value : ph))}
                    placeholder="+972..." style={{ ...inp, flex: 1 }} />
                  {phones.length > 1 && (
                    <button onClick={() => setPhones(prev => prev.filter((_, pi) => pi !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inp} />
            </div>
            <div>
              <label style={lbl}>Страна</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={inp}>
                <option value="">—</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Город</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Тель-Авив" style={inp} />
            </div>
            <div>
              <label style={lbl}>Улица</label>
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Дизенгоф" style={inp} />
            </div>
            <div>
              <label style={lbl}>Дом</label>
              <input value={house} onChange={e => setHouse(e.target.value)} placeholder="123" style={inp} />
            </div>
            <div>
              <label style={lbl}>Квартира</label>
              <input value={apartment} onChange={e => setApartment(e.target.value)} placeholder="45" style={inp} />
            </div>
            <div>
              <label style={lbl}>Индекс</label>
              <input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="6120001" style={inp} />
            </div>
          </div>
        )

      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Мама</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                <div>
                  <label style={lbl}>ФИО</label>
                  <input value={momName} onChange={e => setMomName(e.target.value)} placeholder="Иванова Нина Петровна" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Телефон</label>
                  <input value={momPhone} onChange={e => setMomPhone(e.target.value)} placeholder="+972..." style={inp} />
                </div>
              </div>
            </div>
            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Папа</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                <div>
                  <label style={lbl}>ФИО</label>
                  <input value={dadName} onChange={e => setDadName(e.target.value)} placeholder="Иванов Петр Иванович" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Телефон</label>
                  <input value={dadPhone} onChange={e => setDadPhone(e.target.value)} placeholder="+972..." style={inp} />
                </div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Контактное лицо</div>
                <button onClick={() => setExtraContacts(prev => [...prev, { name: '', relation: '', phone: '', email: '' }])}
                  style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  + Добавить контактное лицо
                </button>
              </div>
              {extraContacts.map((c, i) => (
                <div key={i} style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, position: 'relative' }}>
                  <button onClick={() => setExtraContacts(prev => prev.filter((_, ci) => ci !== i))}
                    style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1, padding: 0 }}>
                    ×
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    <div>
                      <label style={lbl}>ФИО</label>
                      <input value={c.name}
                        onChange={e => setExtraContacts(prev => prev.map((ec, ei) => ei === i ? { ...ec, name: e.target.value } : ec))}
                        placeholder="Петрова Анна Ивановна" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Степень родства</label>
                      <input value={c.relation}
                        onChange={e => setExtraContacts(prev => prev.map((ec, ei) => ei === i ? { ...ec, relation: e.target.value } : ec))}
                        placeholder="Тётя" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Телефон</label>
                      <input value={c.phone}
                        onChange={e => setExtraContacts(prev => prev.map((ec, ei) => ei === i ? { ...ec, phone: e.target.value } : ec))}
                        placeholder="+972..." style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Email</label>
                      <input type="email" value={c.email}
                        onChange={e => setExtraContacts(prev => prev.map((ec, ei) => ei === i ? { ...ec, email: e.target.value } : ec))}
                        placeholder="email@..." style={inp} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 3:
        return (
          <div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' }}>
              Укажите направления которые интересуют
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => setInterests(prev => [...prev, { institution: 'university', direction: '' }])}
                style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Добавить направление
              </button>
            </div>
            {interests.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <select value={item.institution} onChange={e => updateInterest(idx, 'institution', e.target.value)}
                  style={{ ...inp, flex: '0 0 160px', width: 'auto' }}>
                  {INSTITUTIONS.map(inst => <option key={inst} value={inst}>{INST_LABELS[inst]}</option>)}
                </select>
                <input value={item.direction} onChange={e => updateInterest(idx, 'direction', e.target.value)}
                  placeholder="Направление..." style={{ ...inp, flex: 1 }} />
                {interests.length > 1 && (
                  <button onClick={() => setInterests(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )

      case 4:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lbl}>Источник обращения</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={inp}>
                <option value="">— Не указан —</option>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Комментарий</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={5}
                style={{ ...inp, resize: 'vertical' }} placeholder="Дополнительные заметки..." />
            </div>
          </div>
        )

      default: return null
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>Добавить лида</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Search section */}
        {view === 'search' && (
          <div style={{ flexShrink: 0, padding: '14px 24px', position: 'relative' }}>
            <label style={lbl}>Поиск существующего человека</label>
            <input
              autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Имя или email..." style={inp}
            />
            {(searching || results.length > 0) && (
              <div style={{ position: 'absolute', top: 'calc(100% - 8px)', left: 24, right: 24, zIndex: 100, background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                {searching && <div style={{ padding: '10px 14px', fontSize: 13, color: '#9CA3AF' }}>Поиск...</div>}
                {results.map(p => (
                  <button key={p.id} onClick={() => selectPerson(p)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #F9FAFB', cursor: 'pointer', fontSize: 13 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    <div style={{ fontWeight: 500, color: '#1F2937' }}>{p.full_name}</div>
                    {p.email && <div style={{ fontSize: 12, color: '#6B7280' }}>{p.email}</div>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { setView('new'); setTabIdx(0) }}
              style={{ marginTop: 10, fontSize: 13, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Создать нового человека
            </button>
          </div>
        )}

        {/* Person indicator + tab steps */}
        {view !== 'search' && (
          <>
            <div style={{ flexShrink: 0, padding: '10px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                {view === 'existing' && selected
                  ? <>Человек: <strong style={{ color: '#1F2937' }}>{selected.full_name}</strong></>
                  : <strong style={{ color: '#1F2937' }}>Новый человек</strong>}
              </span>
              <button onClick={() => { setView('search'); setSelected(null); setTabIdx(0) }}
                style={{ fontSize: 11, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                изменить
              </button>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', padding: '10px 20px 0', gap: 2 }}>
              {MODAL_TABS.map((tab, i) => (
                <button key={i} onClick={() => { setError(''); setTabIdx(i) }}
                  style={{
                    flex: '1 1 0', padding: '8px 4px 10px', fontSize: 11,
                    fontWeight: tabIdx === i ? 600 : 400,
                    color: tabIdx === i ? '#2D3170' : (i < tabIdx ? '#4BAED4' : '#9CA3AF'),
                    background: 'none', border: 'none',
                    borderBottom: tabIdx === i ? '2px solid #2D3170' : '2px solid transparent',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'color 0.15s',
                  }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                    background: tabIdx === i ? '#2D3170' : (i < tabIdx ? '#4BAED4' : '#E5E7EB'),
                    color: i <= tabIdx ? '#fff' : '#9CA3AF',
                  }}>
                    {i < tabIdx ? '✓' : i + 1}
                  </span>
                  {tab}
                </button>
              ))}
            </div>
            <div style={{ flexShrink: 0, height: 1, background: '#E5E7EB' }} />
          </>
        )}

        {/* Form body */}
        {view !== 'search' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 8px' }}>
            {renderTab()}
          </div>
        )}

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '12px 24px 18px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6B7280' }}>
            Отмена
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {error && <span style={{ fontSize: 12, color: '#EF4444', maxWidth: 220, textAlign: 'right' }}>{error}</span>}
            {view !== 'search' && tabIdx > 0 && (
              <button onClick={goBack}
                style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                Назад
              </button>
            )}
            {view !== 'search' && tabIdx < 4 && (
              <button onClick={goNext}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2D3170', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Далее
              </button>
            )}
            {view !== 'search' && tabIdx === 4 && (
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2D3170', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EducationPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('recruitment')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [instFilter, setInstFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [converting, setConverting] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/education/leads')
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'recruitment') loadLeads()
  }, [tab, loadLeads])

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      l.full_name.toLowerCase().includes(q) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      l.phones.some(p => p.includes(q))
    const matchInst = !instFilter || l.interests.some(i => i.institution === instFilter)
    return matchSearch && matchInst
  })

  async function handleConvert(profileId: string) {
    setConverting(profileId)
    const res = await fetch(`/api/education/leads/${profileId}/convert`, { method: 'PATCH' })
    if (res.ok) await loadLeads()
    setConverting(null)
  }

  const tabBtn = (key: TabKey, label: string) => (
    <button key={key} onClick={() => setTab(key)} style={{
      padding: '8px 20px', fontSize: 14,
      fontWeight: tab === key ? 600 : 400,
      color: tab === key ? '#2D3170' : '#6B7280',
      borderBottom: tab === key ? '2px solid #4BAED4' : '2px solid transparent',
      marginBottom: -2, background: 'none', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer',
    }}>
      {label}
    </button>
  )

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование' },
      ]} />

      <div style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Образование</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => tabBtn(t.key, t.label))}
      </div>

      {/* ── Набор tab ─────────────────────────────────────────────────────── */}
      {tab === 'recruitment' && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по имени, телефону, email..."
              style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none' }}
            />
            <select value={instFilter} onChange={e => setInstFilter(e.target.value)}
              style={{ padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', color: instFilter ? '#1F2937' : '#9CA3AF' }}>
              <option value="">Все заведения</option>
              {INSTITUTIONS.map(inst => <option key={inst} value={inst}>{INST_LABELS[inst]}</option>)}
            </select>
            <button onClick={() => setAddOpen(true)}
              style={{ padding: '8px 16px', background: '#2D3170', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
              + Добавить лида
            </button>
          </div>

          {/* Table card */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Загрузка...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                {leads.length === 0 ? 'Лиды не добавлены' : 'Ничего не найдено'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {['ИМЯ', 'ТЕЛЕФОН', 'EMAIL', 'НАПРАВЛЕНИЯ', 'ИСТОЧНИК', 'ДАТА', 'СТАТУС', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => (
                    <tr key={lead.profile_id} style={{ borderBottom: '1px solid #F9FAFB' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                      {/* Фото + Имя */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {lead.photo_url ? (
                            <img src={lead.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#2563EB', flexShrink: 0 }}>
                              {initials(lead.full_name)}
                            </div>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{lead.full_name}</span>
                        </div>
                      </td>

                      {/* Телефон */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        {lead.phones[0] ?? '—'}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {lead.email ?? '—'}
                      </td>

                      {/* Направления */}
                      <td style={{ padding: '11px 14px' }}>
                        {lead.interests.length === 0 ? (
                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {lead.interests.map((i, idx) => (
                              <span key={idx} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#EEF2FF', color: '#3730A3', whiteSpace: 'nowrap' }}>
                                {INST_LABELS[i.institution] ?? i.institution}
                                {i.direction ? ` · ${i.direction}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Источник */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {lead.referral_source ? (SOURCE_LABELS[lead.referral_source] ?? lead.referral_source) : '—'}
                      </td>

                      {/* Дата */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {formatDate(lead.application_date)}
                      </td>

                      {/* Статус */}
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#ECFDF5', color: '#065F46', fontWeight: 500 }}>
                          Потенциальный
                        </span>
                      </td>

                      {/* Действия */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => router.push(`/dashboard/education/leads/${lead.profile_id}`)}
                            style={{ padding: '5px 12px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}>
                            Открыть
                          </button>
                          <button
                            onClick={() => handleConvert(lead.profile_id)}
                            disabled={converting === lead.profile_id}
                            style={{ padding: '5px 12px', fontSize: 12, border: 'none', borderRadius: 6, background: '#EEF2FF', color: '#3730A3', cursor: converting === lead.profile_id ? 'not-allowed' : 'pointer', opacity: converting === lead.profile_id ? 0.5 : 1 }}>
                            {converting === lead.profile_id ? '...' : 'В абитуриенты'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Placeholder for other tabs */}
      {tab !== 'recruitment' && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <p style={{ fontSize: 14, color: '#9CA3AF' }}>Раздел в разработке</p>
        </div>
      )}

      {addOpen && (
        <AddLeadModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); loadLeads() }} />
      )}
    </div>
  )
}
