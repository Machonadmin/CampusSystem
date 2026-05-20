'use client'

import { useEffect, useRef, useState } from 'react'
import { DateInput } from '@/components/ui/date-input'
import { CitySelect } from '@/components/ui/city-select'
import { CountrySelect } from '@/components/ui/country-select'
import { PersonSelect } from '@/components/ui/person-select'
import PersonRelationField, { type PersonRelationValue } from '@/components/ui/PersonRelationField'
import { getModuleColor } from '@/lib/module-colors'

// ── Types ─────────────────────────────────────────────────────────────────────

export type JourneyFormMode = 'lead' | 'applicant' | 'student'

interface PersonResult { id: string; full_name: string; email: string | null }
interface Interest { institution: string; direction: string }
type ModalView = 'search' | 'new' | 'existing'

export interface EducationJourneyFormProps {
  mode: JourneyFormMode
  onClose: () => void
  onSaved: (createdId?: string) => void
  initialPersonId?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TAB_LABELS_BASE = ['Личные данные', 'Контакты и адрес', 'Семья', 'Община', 'Направления', 'Дополнительно']
const TAB_LABELS_WITH_ACADEMIC = [...TAB_LABELS_BASE, 'Академические данные']

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

const MODE_CONFIG = {
  lead:      { title: 'Добавить лида',       saveLabel: 'Создать лида' },
  applicant: { title: 'Добавить абитуриента', saveLabel: 'Создать абитуриента' },
  student:   { title: 'Добавить студента',   saveLabel: 'Создать студента' },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPhoneFlag(phone: string): string {
  if (phone.startsWith('+972')) return '🇮🇱'
  if (phone.startsWith('+380')) return '🇺🇦'
  if (phone.startsWith('+375')) return '🇧🇾'
  if (phone.startsWith('+7')) return '🇷🇺'
  if (phone.startsWith('+1')) return '🇺🇸'
  if (phone.startsWith('+49')) return '🇩🇪'
  if (phone.startsWith('+33')) return '🇫🇷'
  if (phone.startsWith('+44')) return '🇬🇧'
  return '📞'
}

function FlagPhone({ value, onChange, disabled, wrapStyle, inputStyle, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean
  wrapStyle?: React.CSSProperties; inputStyle?: React.CSSProperties; placeholder?: string
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', ...wrapStyle }}>
      <span style={{ position: 'absolute', left: 10, fontSize: 15, pointerEvents: 'none', userSelect: 'none', zIndex: 1 }}>{getPhoneFlag(value)}</span>
      <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        placeholder={placeholder ?? '+7...'}
        style={{ ...inputStyle, paddingLeft: 34 }} />
    </div>
  )
}

// ── Default communities item ──────────────────────────────────────────────────

type CommunityEntry = {
  country: string; city: string;
  name: string; contact_person: string; contact_person_id: string | null; position: string;
  phone: string; email: string; contacts: { type: string; value: string }[];
}

const DEFAULT_COMMUNITY: CommunityEntry = {
  country: 'Россия', city: '', name: '', contact_person: '', contact_person_id: null,
  position: '', phone: '', email: '', contacts: [],
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EducationJourneyForm({ mode, onClose, onSaved, initialPersonId }: EducationJourneyFormProps) {
  const [view, setView] = useState<ModalView>('new')
  const [selected, setSelected] = useState<PersonResult | null>(null)
  const [tabIdx, setTabIdx] = useState(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [searchExpanded, setSearchExpanded] = useState(false)

  // Tab 0 – Личные данные
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [hebrewName, setHebrewName] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState<Date | null>(null)
  const [maritalStatus, setMaritalStatus] = useState('')
  const [citizenship, setCitizenship] = useState('Россия')
  const [passportNumber, setPassportNumber] = useState('')

  // Tab 1 – Контакты и адрес
  const [phones, setPhones] = useState<string[]>([''])
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('Россия')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [house, setHouse] = useState('')
  const [apartment, setApartment] = useState('')
  const [postalCode, setPostalCode] = useState('')

  // Tab 2 – Семья
  const [familyRelations, setFamilyRelations] = useState<PersonRelationValue[]>([
    { relative_id: null, relation_type: 'mother', notes: null },
    { relative_id: null, relation_type: 'father', notes: null },
  ])

  // Tab 3 – Община
  const [communities, setCommunities] = useState<CommunityEntry[]>([{ ...DEFAULT_COMMUNITY }])

  // Tab 4 – Направления
  const [interests, setInterests] = useState<Interest[]>([{ institution: 'university', direction: '' }])

  // Tab 5 – Дополнительно
  const [source, setSource] = useState('')
  const [comment, setComment] = useState('')

  // Tab 6 (applicant/student) – Академические данные
  const [primaryDepartmentId, setPrimaryDepartmentId] = useState<string | null>(null)
  const [specialtyId, setSpecialtyId] = useState<string | null>(null)
  const [mainGroupId, setMainGroupId] = useState<string | null>(null)
  const [yearLevel, setYearLevel] = useState<string>('')
  const [yearStart, setYearStart] = useState<string>('')
  const [enrolledAt, setEnrolledAt] = useState<string>(() => new Date().toISOString().slice(0, 10))

  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [specialties, setSpecialties] = useState<{ id: string; name: string; department_id: string }[]>([])
  const [studyGroups, setStudyGroups] = useState<{ id: string; name: string; department_id: string }[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingPerson, setLoadingPerson] = useState(false)

  // Search query effect
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

  // Pre-fill with initialPersonId
  useEffect(() => {
    if (initialPersonId) {
      void selectPerson({ id: initialPersonId, full_name: '', email: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPersonId])

  // Load departments list when academic tab is needed
  useEffect(() => {
    if (mode === 'lead') return
    fetch('/api/settings/departments')
      .then(r => r.ok ? r.json() : [])
      .then((d: unknown) => {
        const list = Array.isArray(d)
          ? d
          : ((d as { departments?: unknown[] })?.departments ?? [])
        setDepartments((list as { id: string; name: string }[]).map(x => ({ id: x.id, name: x.name })))
      })
      .catch(() => {})
  }, [mode])

  // Cascading specialties + study_groups by primary department
  useEffect(() => {
    if (!primaryDepartmentId) {
      setSpecialties([])
      setStudyGroups([])
      setSpecialtyId(null)
      setMainGroupId(null)
      return
    }
    void Promise.all([
      fetch(`/api/education/specialties?department_id=${primaryDepartmentId}`)
        .then(r => r.ok ? r.json() : { specialties: [] })
        .then(d => (d.specialties ?? []) as { id: string; name: string; department_id: string }[]),
      fetch(`/api/education/study-groups?department_id=${primaryDepartmentId}`)
        .then(r => r.ok ? r.json() : { study_groups: [] })
        .then(d => (d.study_groups ?? []) as { id: string; name: string; department_id: string }[]),
    ]).then(([specs, groups]) => {
      setSpecialties(specs)
      setStudyGroups(groups)
      setSpecialtyId(prev => prev && specs.find(s => s.id === prev) ? prev : null)
      setMainGroupId(prev => prev && groups.find(g => g.id === prev) ? prev : null)
    }).catch(() => {})
  }, [primaryDepartmentId])

  function resetFields() {
    setView('new')
    setSelected(null)
    setTabIdx(0)
    setQuery('')
    setResults([])
    setSearchExpanded(false)
    setError('')
    setLastName(''); setFirstName(''); setMiddleName('')
    setHebrewName(''); setGender(''); setBirthDate(null)
    setMaritalStatus(''); setCitizenship('Россия'); setPassportNumber(''); setPhotoPreview(null)
    setPhones(['']); setEmail(''); setCountry('Россия'); setCity('')
    setStreet(''); setHouse(''); setApartment(''); setPostalCode('')
    setFamilyRelations([
      { relative_id: null, relation_type: 'mother', notes: null },
      { relative_id: null, relation_type: 'father', notes: null },
    ])
    setCommunities([{ ...DEFAULT_COMMUNITY }])
    setInterests([{ institution: 'university', direction: '' }])
    setSource('')
    setComment('')
    setPrimaryDepartmentId(null)
    setSpecialtyId(null)
    setMainGroupId(null)
    setYearLevel('')
    setYearStart('')
    setEnrolledAt(new Date().toISOString().slice(0, 10))
  }

  async function loadPersonData(id: string) {
    setLoadingPerson(true)
    try {
      const res = await fetch(`/api/persons/${id}`)
      if (!res.ok) return
      const d = await res.json()
      setLastName(d.last_name ?? '')
      setFirstName(d.first_name ?? '')
      setMiddleName(d.middle_name ?? '')
      setHebrewName(d.hebrew_name ?? '')
      setGender(d.gender ?? '')
      setBirthDate(d.birth_date ? new Date(d.birth_date) : null)
      setMaritalStatus(d.marital_status ?? '')
      setCitizenship(d.citizenship ?? '')
      setPassportNumber(d.passport_number ?? '')
      if (d.photo_url) setPhotoPreview(d.photo_url)
      const rawPhones: unknown[] = Array.isArray(d.phones) ? d.phones : d.phone ? [d.phone] : []
      const flatPhones = rawPhones
        .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? String(p)))
        .filter(Boolean)
      if (flatPhones.length > 0) setPhones(flatPhones)
      if (d.email) setEmail(d.email)
      const addr = (d.address as Record<string, string> | null) ?? {}
      setCountry(addr.country ?? ''); setCity(addr.city ?? ''); setStreet(addr.street ?? '')
      setHouse(addr.house ?? ''); setApartment(addr.apartment ?? ''); setPostalCode(addr.postal_code ?? '')
      // Семейные связи грузятся отдельно через GET /api/persons/[id]/relatives
    } finally {
      setLoadingPerson(false)
    }
  }

  async function selectPerson(p: PersonResult) {
    setSelected(p); setView('existing'); setQuery(''); setResults([]); setTabIdx(0); setSearchExpanded(false)
    await loadPersonData(p.id)
  }

  const tabs = mode === 'lead' ? TAB_LABELS_BASE : TAB_LABELS_WITH_ACADEMIC
  const lastTabIdx = tabs.length - 1

  function goNext() {
    setError('')
    if (view === 'new') {
      if (tabIdx === 0 && !lastName.trim()) { setError('Фамилия обязательна'); return }
      if (tabIdx === 0 && !firstName.trim()) { setError('Имя обязательно'); return }
      if (tabIdx === 1 && !phones.some(p => p.trim())) { setError('Введите хотя бы один телефон'); return }
    }
    setTabIdx(t => Math.min(t + 1, lastTabIdx))
  }

  function goBack() { setError(''); setTabIdx(t => Math.max(t - 1, 0)) }

  function updateInterest(idx: number, field: keyof Interest, value: string) {
    setInterests(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      // Build communities list (applies regardless of view — bug fix)
      const validCommunities = communities
        .filter(c => c.name || c.contact_person || c.phone || c.country || c.city)
        .map(c => ({ ...c, contacts: c.contacts.filter(x => x.value.trim()) }))

      if (mode === 'lead') {
        // POST /api/education/leads — existing format
        const body: Record<string, unknown> = {
          interests: interests.filter(i => i.institution),
          referral_source: source || undefined,
          comment: comment || undefined,
        }
        if (view === 'existing' && selected) {
          body.person_id = selected.id
        } else {
          if (!lastName.trim()) { setError('Фамилия обязательна'); setSaving(false); return }
          if (!firstName.trim()) { setError('Имя обязательно'); setSaving(false); return }
          const validPhones = phones.filter(p => p.trim())
          if (validPhones.length === 0) { setError('Телефон обязателен'); setSaving(false); return }
          body.last_name = lastName.trim()
          body.first_name = firstName.trim()
          body.middle_name = middleName.trim() || null
          body.phone = validPhones[0]
          if (validPhones.length > 1) body.phones = validPhones
          if (email) body.email = email.trim()
          if (gender) body.gender = gender
          if (birthDate) body.birth_date = birthDate.toISOString().split('T')[0]
          if (hebrewName) body.hebrew_name = hebrewName.trim()
          if (maritalStatus) body.marital_status = maritalStatus
          if (citizenship) body.citizenship = citizenship.trim()
          if (passportNumber) body.passport_number = passportNumber.trim()
          const addr = { country, city, street, house, apartment, postal_code: postalCode }
          if (Object.values(addr).some(v => v)) body.address = addr
        }
        if (validCommunities.length > 0) body.communities = validCommunities

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
        const created = await res.json().catch(() => ({})) as { person_id?: string; journey_id?: string }
        const personId = created.person_id ?? (view === 'existing' ? selected?.id : null)
        await saveRelatives(personId ?? null)
        resetFields()
        onSaved(created.journey_id)

      } else {
        // POST /api/education/journeys — applicant | student
        if (mode === 'student' && !primaryDepartmentId) {
          setError('Для студента необходимо выбрать подразделение')
          setTabIdx(6)
          setSaving(false)
          return
        }
        const body: Record<string, unknown> = {
          education_status: mode,
          referral_source: source || null,
          notes: comment || null,
          primary_department_id: primaryDepartmentId,
          specialty_id: specialtyId,
          main_group_id: mainGroupId,
          year_level: yearLevel ? parseInt(yearLevel, 10) : null,
          year_start: yearStart ? parseInt(yearStart, 10) : null,
          enrolled_at: enrolledAt || null,
        }
        if (view === 'existing' && selected) {
          body.person_id = selected.id
        } else {
          if (!lastName.trim()) { setError('Фамилия обязательна'); setSaving(false); return }
          if (!firstName.trim()) { setError('Имя обязательно'); setSaving(false); return }
          const validPhones = phones.filter(p => p.trim())
          if (validPhones.length === 0) { setError('Телефон обязателен'); setSaving(false); return }
          body.new_person = {
            last_name: lastName.trim(),
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            hebrew_name: hebrewName.trim() || null,
            gender: gender || null,
            birth_date: birthDate ? birthDate.toISOString().split('T')[0] : null,
            email: email.trim() || null,
            phones: validPhones,
          }
        }

        const res = await fetch('/api/education/journeys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json()
          setError(data.error ?? 'Ошибка')
          return
        }
        const journey = await res.json().catch(() => ({})) as { id?: string; person_id?: string }
        const personId = journey.person_id ?? (view === 'existing' ? selected?.id : null)
        await saveRelatives(personId ?? null)
        resetFields()
        onSaved(journey.id)
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveRelatives(personId: string | null) {
    if (!personId) return
    const validRelations = familyRelations.filter(r => r.relative_id)
    await Promise.all(validRelations.map(rel =>
      fetch(`/api/persons/${personId}/relatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relative_id: rel.relative_id,
          relation_type: rel.relation_type,
          notes: rel.notes,
        }),
      }).catch(() => null)
    ))
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block',
  }

  function renderTab() {
    const ro = view === 'existing'
    const dis: React.CSSProperties = ro ? { opacity: 0.6, cursor: 'not-allowed', background: '#F9FAFB' } : {}

    switch (tabIdx) {
      case 0:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            {ro && (
              <div style={{ gridColumn: '1 / -1', background: '#EEF2FF', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#4338CA', marginBottom: 4 }}>
                {loadingPerson ? 'Загрузка данных...' : '📋 Данные загружены из профиля · только для просмотра'}
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', border: '2px dashed #D1D5DB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {photoPreview
                  ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 28, opacity: 0.25 }}>◯</span>}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#3B82F6', cursor: 'pointer', padding: '6px 14px', border: '1px solid #3B82F6', borderRadius: 8, display: 'inline-block' }}>
                  Загрузить фото
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setPhotoPreview(URL.createObjectURL(f)) }} />
                </label>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Необязательно · JPG, PNG</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {!searchExpanded ? (
                  <button onClick={() => setSearchExpanded(true)}
                    style={{ fontSize: 12, color: '#4BAED4', border: '1px solid #4BAED4', borderRadius: 8, padding: '6px 12px', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    🔍 Найти существующего человека
                  </button>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Имя или email..." style={{ ...inp, width: 220 }} />
                      <button onClick={() => { setSearchExpanded(false); setQuery(''); setResults([]) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 20, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>
                        ×
                      </button>
                    </div>
                    {(searching || results.length > 0) && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100, background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 260, maxHeight: 220, overflowY: 'auto' }}>
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
                  </div>
                )}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Фамилия *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Иванова" disabled={ro} style={{ ...inp, ...dis }} />
              </div>
              <div>
                <label style={lbl}>Имя *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Мария" disabled={ro} style={{ ...inp, ...dis }} />
              </div>
              <div>
                <label style={lbl}>Отчество</label>
                <input value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Ивановна" disabled={ro} style={{ ...inp, ...dis }} />
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Еврейское имя</label>
              <input value={hebrewName} onChange={e => setHebrewName(e.target.value)} placeholder="Мириам" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Пол</label>
              <select value={gender} onChange={e => setGender(e.target.value)} disabled={ro} style={{ ...inp, ...dis }}>
                <option value="">—</option>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Дата рождения</label>
              <DateInput value={birthDate} onChange={setBirthDate} maxDate={new Date()} minDate={new Date(1940, 0, 1)} disabled={ro} style={dis} />
            </div>
            <div>
              <label style={lbl}>Семейное положение</label>
              <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} disabled={ro} style={{ ...inp, ...dis }}>
                <option value="">—</option>
                <option value="single">Не замужем</option>
                <option value="married">Замужем</option>
                <option value="divorced">Разведена</option>
                <option value="widowed">Вдова</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Гражданство</label>
              <CountrySelect value={citizenship} onChange={setCitizenship} disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Номер паспорта</label>
              <input value={passportNumber} onChange={e => setPassportNumber(e.target.value)} placeholder="AA 123456" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
          </div>
        )

      case 1:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            {ro && (
              <div style={{ gridColumn: '1 / -1', background: '#EEF2FF', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#4338CA', marginBottom: 4 }}>
                📋 Данные загружены из профиля · только для просмотра
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Телефоны{view === 'new' ? ' *' : ''}</label>
                {!ro && <button onClick={() => setPhones(prev => [...prev, ''])}
                  style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  + Добавить телефон
                </button>}
              </div>
              {phones.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <FlagPhone value={p} onChange={v => setPhones(prev => prev.map((ph, pi) => pi === i ? v : ph))}
                    disabled={ro} wrapStyle={{ flex: 1 }} inputStyle={{ ...inp, ...dis }} />
                  {!ro && phones.length > 1 && (
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
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Страна</label>
              <CountrySelect value={country} onChange={setCountry} disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Город</label>
              <CitySelect country={country} value={city} onChange={setCity} disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Улица</label>
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Дизенгоф" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Дом</label>
              <input value={house} onChange={e => setHouse(e.target.value)} placeholder="123" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Квартира</label>
              <input value={apartment} onChange={e => setApartment(e.target.value)} placeholder="45" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Индекс</label>
              <input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="6120001" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
          </div>
        )

      case 2:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ro && (
              <div style={{ background: '#EEF2FF', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#4338CA' }}>
                📋 Данные загружены из профиля · только для просмотра
              </div>
            )}
            {familyRelations.map((rel, idx) => {
              const isFixed = idx < 2 && (rel.relation_type === 'mother' || rel.relation_type === 'father')
              const fixedLabel = rel.relation_type === 'mother' ? 'Мать' : 'Отец'
              return (
                <PersonRelationField
                  key={idx}
                  value={rel}
                  onChange={(updated) => setFamilyRelations(prev => prev.map((r, i) => i === idx ? updated : r))}
                  onRemove={!isFixed ? () => setFamilyRelations(prev => prev.filter((_, i) => i !== idx)) : undefined}
                  showRemove={!isFixed}
                  fixedRelationType={isFixed ? rel.relation_type : undefined}
                  label={isFixed ? fixedLabel : undefined}
                  accentColor={getModuleColor('education')}
                  availableRelations={['spouse', 'child', 'sibling', 'grandparent', 'guardian', 'emergency_contact', 'other']}
                />
              )
            })}
            <button
              onClick={() => setFamilyRelations(prev => [...prev, { relative_id: null, relation_type: 'sibling', notes: null }])}
              style={{
                padding: '8px 12px', fontSize: 13, color: getModuleColor('education'),
                background: 'transparent', border: `1px dashed ${getModuleColor('education', 'medium')}`,
                borderRadius: 8, cursor: 'pointer', alignSelf: 'flex-start',
              }}
            >
              + Добавить родственника / контакт
            </button>
          </div>
        )

      case 3: {
        const communityContactTypes = (
          <>
            <option value="phone">Телефон</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="address">Адрес</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="vk">VK</option>
            <option value="other">Другое</option>
          </>
        )
        const updateComm = (i: number, field: string, value: string) =>
          setCommunities(prev => prev.map((c, ci) => ci === i ? { ...c, [field]: value } : c))
        const updateCommCountry = (i: number, newCountry: string) => {
          setCommunities(prev => prev.map((c, ci) => ci === i ? { ...c, country: newCountry, city: '' } : c))
        }
        return (
          <div>
            {communities.map((comm, i) => {
              const isCard = communities.length > 1
              const wrap: React.CSSProperties = isCard
                ? { background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', marginBottom: 12, position: 'relative' }
                : {}
              return (
                <div key={i} style={wrap}>
                  {isCard && (
                    <button onClick={() => setCommunities(prev => prev.filter((_, ci) => ci !== i))}
                      style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1, padding: 0 }}>
                      ×
                    </button>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    <div>
                      <label style={lbl}>Страна общины</label>
                      <CountrySelect value={comm.country} onChange={ct => updateCommCountry(i, ct)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Город общины</label>
                      <CitySelect
                        country={comm.country}
                        value={comm.city}
                        onChange={v => updateComm(i, 'city', v)}
                        disabled={!comm.country}
                        style={{ ...inp, ...(!comm.country ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Название общины</label>
                      <input value={comm.name} onChange={e => updateComm(i, 'name', e.target.value)}
                        placeholder="Бейт Хабад, Шалом и т.д." style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Контактное лицо</label>
                      <PersonSelect
                        value={comm.contact_person_id}
                        onChange={(personId, personData) => {
                          setCommunities(prev => prev.map((c, ci) => ci === i ? {
                            ...c,
                            contact_person_id: personId,
                            contact_person: personData?.full_name ?? c.contact_person,
                          } : c))
                        }}
                        placeholder="Выберите или добавьте контактное лицо"
                        accentColor={getModuleColor('education')}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Должность в общине</label>
                      <input value={comm.position} onChange={e => updateComm(i, 'position', e.target.value)}
                        placeholder="Раввин, координатор..." style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Телефон</label>
                      <FlagPhone value={comm.phone} onChange={v => updateComm(i, 'phone', v)} inputStyle={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Email</label>
                      <input type="email" value={comm.email} onChange={e => updateComm(i, 'email', e.target.value)}
                        placeholder="email@..." style={inp} />
                    </div>
                    {comm.contacts.map((cc, ci) => (
                      <div key={ci} style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={cc.type}
                          onChange={e => setCommunities(prev => prev.map((c, cj) => cj === i ? { ...c, contacts: c.contacts.map((x, xi) => xi === ci ? { ...x, type: e.target.value } : x) } : c))}
                          style={{ ...inp, flex: '0 0 130px', width: 'auto' }}>
                          {communityContactTypes}
                        </select>
                        <input value={cc.value}
                          onChange={e => setCommunities(prev => prev.map((c, cj) => cj === i ? { ...c, contacts: c.contacts.map((x, xi) => xi === ci ? { ...x, value: e.target.value } : x) } : c))}
                          placeholder="Значение..." style={{ ...inp, flex: 1 }} />
                        <button
                          onClick={() => setCommunities(prev => prev.map((c, cj) => cj === i ? { ...c, contacts: c.contacts.filter((_, xi) => xi !== ci) } : c))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <button
                        onClick={() => setCommunities(prev => prev.map((c, cj) => cj === i ? { ...c, contacts: [...c.contacts, { type: 'phone', value: '' }] } : c))}
                        style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        + Добавить контакт
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            <button
              onClick={() => setCommunities(prev => [...prev, { ...DEFAULT_COMMUNITY }])}
              style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
              + Добавить ещё общину
            </button>
          </div>
        )
      }

      case 4:
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

      case 5:
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

      case 6: {
        const isStudent = mode === 'student'
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
            <div>
              <label style={lbl}>Подразделение{isStudent && ' *'}</label>
              <select
                value={primaryDepartmentId ?? ''}
                onChange={e => setPrimaryDepartmentId(e.target.value || null)}
                style={inp}
              >
                <option value="">— выберите —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Специальность</label>
              <select
                value={specialtyId ?? ''}
                onChange={e => setSpecialtyId(e.target.value || null)}
                disabled={!primaryDepartmentId}
                style={{ ...inp, ...(!primaryDepartmentId ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                <option value="">{primaryDepartmentId ? '— нет —' : 'Сначала выберите подразделение'}</option>
                {specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Базовая группа</label>
              <select
                value={mainGroupId ?? ''}
                onChange={e => setMainGroupId(e.target.value || null)}
                disabled={!primaryDepartmentId}
                style={{ ...inp, ...(!primaryDepartmentId ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              >
                <option value="">{primaryDepartmentId ? '— нет —' : 'Сначала выберите подразделение'}</option>
                {studyGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Курс / Класс</label>
              <input type="number" value={yearLevel} onChange={e => setYearLevel(e.target.value)}
                placeholder="1, 2, 10..." style={inp} />
            </div>
            <div>
              <label style={lbl}>Год набора</label>
              <input type="number" value={yearStart} onChange={e => setYearStart(e.target.value)}
                placeholder="2025" style={inp} />
            </div>
            <div>
              <label style={lbl}>Дата зачисления</label>
              <input type="date" value={enrolledAt} onChange={e => setEnrolledAt(e.target.value)}
                style={inp} />
            </div>
          </div>
        )
      }

      default: return null
    }
  }

  const cfg = MODE_CONFIG[mode]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>{cfg.title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Person indicator + tab steps */}
        <>
          {view === 'existing' && selected && (
            <div style={{ flexShrink: 0, padding: '10px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                Человек: <strong style={{ color: '#1F2937' }}>{selected.full_name}</strong>
              </span>
              <button onClick={() => { resetFields(); setSearchExpanded(true) }}
                style={{ fontSize: 11, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                изменить
              </button>
            </div>
          )}
          <div style={{ flexShrink: 0, display: 'flex', padding: '10px 20px 0', gap: 2 }}>
            {tabs.map((tab, i) => (
              <button key={i} onClick={() => { setError(''); setTabIdx(i) }}
                style={{
                  flex: '1 1 0', padding: '8px 4px 10px', fontSize: 11,
                  fontWeight: tabIdx === i ? 600 : 400,
                  color: tabIdx === i ? '#3B82F6' : (i < tabIdx ? '#4BAED4' : '#9CA3AF'),
                  background: 'none', border: 'none',
                  borderBottom: tabIdx === i ? '2px solid #3B82F6' : '2px solid transparent',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'color 0.15s',
                }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                  background: tabIdx === i ? getModuleColor('education') : (i < tabIdx ? getModuleColor('education', 'medium') : '#E5E7EB'),
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

        {/* Form body */}
        <div style={{ height: 560, overflowY: 'auto', padding: '16px 24px 8px' }}>
          {renderTab()}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '12px 24px 18px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6B7280' }}>
            Отмена
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {error && <span style={{ fontSize: 12, color: '#EF4444', maxWidth: 220, textAlign: 'right' }}>{error}</span>}
            {tabIdx > 0 && (
              <button onClick={goBack}
                style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                Назад
              </button>
            )}
            {tabIdx < lastTabIdx && (
              <button onClick={goNext}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: getModuleColor('education'), color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Далее
              </button>
            )}
            {tabIdx === lastTabIdx && (
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: getModuleColor('education'), color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Сохранение...' : cfg.saveLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
