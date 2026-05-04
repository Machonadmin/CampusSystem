'use client'

import { useEffect, useRef, useState } from 'react'

interface Department {
  id: string
  name: string
  parent_id: string | null
}

interface PersonResult { id: string; full_name: string; email: string | null }

const MODAL_TABS = ['Личные данные', 'Контакты и адрес', 'Должность и отдел', 'Документы и образование', 'Трудовой договор', 'Дополнительно']
const COUNTRIES = ['Израиль', 'Россия', 'США', 'Германия', 'Франция', 'Великобритания', 'Украина', 'Беларусь', 'Казахстан', 'Другая']
const CONTACT_TYPES = [
  { value: 'phone', label: 'Телефон' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'address', label: 'Адрес' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'vk', label: 'VK' },
  { value: 'other', label: 'Другое' },
]

type ModalView = 'new' | 'existing'
interface DeptOption { id: string; label: string }

function flattenTree(depts: Department[]): DeptOption[] {
  const map = new Map<string, Department & { children: Department[] }>()
  for (const d of depts) map.set(d.id, { ...d, children: [] })
  const roots: (Department & { children: Department[] })[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node)
    else roots.push(node)
  }
  const out: DeptOption[] = []
  function walk(node: Department & { children: Department[] }, depth: number) {
    out.push({ id: node.id, label: '  '.repeat(depth) + (depth > 0 ? '└ ' : '') + node.name })
    const children = (node.children as (Department & { children: Department[] })[]).sort((a, b) => a.name.localeCompare(b.name))
    children.forEach(c => walk(c, depth + 1))
  }
  roots.sort((a, b) => a.name.localeCompare(b.name)).forEach(r => walk(r, 0))
  return out
}

export default function AddEmployeeModal({
  onClose, onSaved, defaultDepartmentId,
}: {
  onClose: () => void
  onSaved: () => void
  defaultDepartmentId?: string
}) {
  const [view, setView] = useState<ModalView>('new')
  const [selected, setSelected] = useState<PersonResult | null>(null)
  const [tabIdx, setTabIdx] = useState(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [searchExpanded, setSearchExpanded] = useState(false)

  // Tab 0 — Личные данные
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [hebrewName, setHebrewName] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [maritalStatus, setMaritalStatus] = useState('')
  const [citizenship, setCitizenship] = useState('')

  // Tab 1 — Контакты и адрес
  const [phones, setPhones] = useState<string[]>([''])
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [house, setHouse] = useState('')
  const [apartment, setApartment] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [extraContacts, setExtraContacts] = useState<{ type: string; value: string }[]>([])

  // Tab 2 — Должность и отдел
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? '')
  const [position, setPosition] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [employmentType, setEmploymentType] = useState('staff')
  const [workSchedule, setWorkSchedule] = useState('')

  // Tab 3 — Документы и образование
  const [passportSeries, setPassportSeries] = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [passportIssueDate, setPassportIssueDate] = useState('')
  const [passportIssuedBy, setPassportIssuedBy] = useState('')
  const [educationLevel, setEducationLevel] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [certificates, setCertificates] = useState('')

  // Tab 4 — Трудовой договор
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [salary, setSalary] = useState('')
  const [currency, setCurrency] = useState('ILS')
  const [contractFile, setContractFile] = useState<File | null>(null)

  // Tab 5 — Дополнительно
  const [comment, setComment] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingPerson, setLoadingPerson] = useState(false)

  useEffect(() => {
    fetch('/api/settings/departments')
      .then(r => r.ok ? r.json() : [])
      .then((d: Department[]) => setDepartments(flattenTree(d)))
  }, [])

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

  function resetFields() {
    setFullName(''); setHebrewName(''); setGender(''); setBirthDate(''); setMaritalStatus(''); setCitizenship(''); setPhotoPreview(null)
    setPhones(['']); setEmail(''); setCountry(''); setCity(''); setStreet(''); setHouse(''); setApartment(''); setPostalCode('')
    setExtraContacts([])
  }

  async function loadPersonData(id: string) {
    setLoadingPerson(true)
    try {
      const res = await fetch(`/api/settings/persons/${id}`)
      if (!res.ok) return
      const d = await res.json()
      setFullName(d.full_name ?? '')
      setHebrewName(d.hebrew_name ?? '')
      setGender(d.gender ?? '')
      setBirthDate(d.birth_date ? String(d.birth_date).slice(0, 10) : '')
      setMaritalStatus(d.marital_status ?? '')
      setCitizenship(d.citizenship ?? d.nationality ?? '')
      if (d.photo_url) setPhotoPreview(d.photo_url)
      if (Array.isArray(d.phones) && d.phones.length > 0) setPhones(d.phones)
      else if (d.phone) setPhones([d.phone])
      if (d.email) setEmail(d.email)
      const addr = d.address ?? {}
      setCountry(addr.country ?? ''); setCity(addr.city ?? ''); setStreet(addr.street ?? '')
      setHouse(addr.house ?? ''); setApartment(addr.apartment ?? ''); setPostalCode(addr.postal_code ?? '')
    } finally {
      setLoadingPerson(false)
    }
  }

  async function selectPerson(p: PersonResult) {
    setSelected(p); setView('existing'); setQuery(''); setResults([]); setTabIdx(0); setSearchExpanded(false)
    await loadPersonData(p.id)
  }

  function goNext() {
    setError('')
    if (view === 'new') {
      if (tabIdx === 0 && !fullName.trim()) { setError('ФИО обязательно'); return }
      if (tabIdx === 1 && !phones.some(p => p.trim())) { setError('Введите хотя бы один телефон'); return }
    }
    if (tabIdx === 2) {
      if (!departmentId) { setError('Выберите отдел'); return }
      if (!position.trim()) { setError('Должность обязательна'); return }
      if (!hireDate) { setError('Дата приёма обязательна'); return }
    }
    setTabIdx(t => Math.min(t + 1, 5))
  }

  function goBack() { setError(''); setTabIdx(t => Math.max(t - 1, 0)) }

  async function handleSave() {
    setError('')
    if (!departmentId) { setError('Выберите отдел'); setTabIdx(2); return }
    if (!position.trim()) { setError('Должность обязательна'); setTabIdx(2); return }
    if (!hireDate) { setError('Дата приёма обязательна'); setTabIdx(2); return }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        department_id: departmentId,
        position: position.trim(),
        hire_date: hireDate,
        employment_type: employmentType,
      }

      if (view === 'existing' && selected) {
        body.person_id = selected.id
      } else {
        if (!fullName.trim()) { setError('ФИО обязательно'); setSaving(false); setTabIdx(0); return }
        const validPhones = phones.filter(p => p.trim())
        if (validPhones.length === 0) { setError('Телефон обязателен'); setSaving(false); setTabIdx(1); return }
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
        const validExtra = extraContacts.filter(c => c.value.trim())
        if (validExtra.length > 0) body.contacts = validExtra
      }

      if (workSchedule) body.work_schedule = workSchedule
      if (passportSeries || passportNumber || passportIssueDate || passportIssuedBy) {
        body.passport = {
          series: passportSeries || undefined,
          number: passportNumber || undefined,
          issue_date: passportIssueDate || undefined,
          issued_by: passportIssuedBy || undefined,
        }
      }
      if (educationLevel || specialty || graduationYear || certificates) {
        body.education = {
          level: educationLevel || undefined,
          specialty: specialty || undefined,
          graduation_year: graduationYear ? Number(graduationYear) : undefined,
          certificates: certificates || undefined,
        }
      }
      if (contractNumber || contractDate || salary) {
        body.contract = {
          number: contractNumber || undefined,
          date: contractDate || undefined,
          salary: salary ? Number(salary) : undefined,
          currency: currency || undefined,
          file_name: contractFile?.name,
        }
      }
      if (comment) body.comment = comment

      const res = await fetch('/api/staff', {
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
  const cardStyle: React.CSSProperties = {
    background: '#F9FAFB', borderRadius: 10, padding: '14px 16px',
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
                <label style={{ fontSize: 12, fontWeight: 500, color: '#2D3170', cursor: 'pointer', padding: '6px 14px', border: '1px solid #2D3170', borderRadius: 8, display: 'inline-block' }}>
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
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>ФИО *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Еврейское имя</label>
              <input value={hebrewName} onChange={e => setHebrewName(e.target.value)} placeholder="Avraham" dir="ltr" disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Пол</label>
              <select value={gender} onChange={e => setGender(e.target.value)} disabled={ro} style={{ ...inp, ...dis }}>
                <option value="">—</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Дата рождения</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} disabled={ro} style={{ ...inp, ...dis }} />
            </div>
            <div>
              <label style={lbl}>Семейное положение</label>
              <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} disabled={ro} style={{ ...inp, ...dis }}>
                <option value="">—</option>
                <option value="single">Не женат / Не замужем</option>
                <option value="married">Женат / Замужем</option>
                <option value="divorced">Разведён(а)</option>
                <option value="widowed">Вдовец / Вдова</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Гражданство</label>
              <input value={citizenship} onChange={e => setCitizenship(e.target.value)} placeholder="Израиль" disabled={ro} style={{ ...inp, ...dis }} />
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
                  <input value={p} onChange={e => setPhones(prev => prev.map((ph, pi) => pi === i ? e.target.value : ph))}
                    placeholder="+972..." disabled={ro} style={{ ...inp, flex: 1, ...dis }} />
                  {!ro && phones.length > 1 && (
                    <button onClick={() => setPhones(prev => prev.filter((_, pi) => pi !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
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
              <select value={country} onChange={e => setCountry(e.target.value)} disabled={ro} style={{ ...inp, ...dis }}>
                <option value="">—</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Город</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Тель-Авив" disabled={ro} style={{ ...inp, ...dis }} />
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
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Дополнительные контакты</label>
                {!ro && <button onClick={() => setExtraContacts(prev => [...prev, { type: 'whatsapp', value: '' }])}
                  style={{ fontSize: 12, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  + Добавить контакт
                </button>}
              </div>
              {extraContacts.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <select value={c.type} onChange={e => setExtraContacts(prev => prev.map((x, xi) => xi === i ? { ...x, type: e.target.value } : x))}
                    disabled={ro} style={{ ...inp, flex: '0 0 130px', width: 'auto', ...dis }}>
                    {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input value={c.value} onChange={e => setExtraContacts(prev => prev.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Значение..." disabled={ro} style={{ ...inp, flex: 1, ...dis }} />
                  {!ro && <button onClick={() => setExtraContacts(prev => prev.filter((_, xi) => xi !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>}
                </div>
              ))}
            </div>
          </div>
        )

      case 2:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Отдел *</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
                <option value="">— Выберите отдел —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Должность *</label>
              <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Менеджер, бухгалтер..." style={inp} />
            </div>
            <div>
              <label style={lbl}>Дата приёма на работу *</label>
              <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Тип занятости</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} style={inp}>
                <option value="staff">Полная ставка</option>
                <option value="part_time">Частичная ставка</option>
                <option value="hourly">Почасовая</option>
                <option value="intern">Стажёр</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>График работы</label>
              <select value={workSchedule} onChange={e => setWorkSchedule(e.target.value)} style={inp}>
                <option value="">—</option>
                <option value="5_2">5/2</option>
                <option value="shift">Сменный</option>
                <option value="flexible">Гибкий</option>
                <option value="remote">Дистанционный</option>
              </select>
            </div>
          </div>
        )

      case 3:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Паспорт</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                <div>
                  <label style={lbl}>Серия паспорта</label>
                  <input value={passportSeries} onChange={e => setPassportSeries(e.target.value)} placeholder="1234" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Номер паспорта</label>
                  <input value={passportNumber} onChange={e => setPassportNumber(e.target.value)} placeholder="567890" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Дата выдачи</label>
                  <input type="date" value={passportIssueDate} onChange={e => setPassportIssueDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Кем выдан</label>
                  <input value={passportIssuedBy} onChange={e => setPassportIssuedBy(e.target.value)} placeholder="МВД..." style={inp} />
                </div>
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Образование</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                <div>
                  <label style={lbl}>Образование</label>
                  <select value={educationLevel} onChange={e => setEducationLevel(e.target.value)} style={inp}>
                    <option value="">—</option>
                    <option value="higher">Высшее</option>
                    <option value="incomplete_higher">Незаконченное высшее</option>
                    <option value="vocational">Среднее специальное</option>
                    <option value="secondary">Среднее</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Год окончания</label>
                  <input type="number" value={graduationYear} onChange={e => setGraduationYear(e.target.value)} placeholder="2020" style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Специальность</label>
                  <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Менеджмент" style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Сертификаты</label>
                  <textarea value={certificates} onChange={e => setCertificates(e.target.value)} rows={3}
                    placeholder="Список сертификатов и дополнительного обучения..." style={{ ...inp, resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Номер договора</label>
              <input value={contractNumber} onChange={e => setContractNumber(e.target.value)} placeholder="ТД-2026-001" style={inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Дата заключения</label>
              <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Оклад / Ставка</label>
              <input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="10000" style={inp} />
            </div>
            <div>
              <label style={lbl}>Валюта</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={inp}>
                <option value="ILS">ILS (₪)</option>
                <option value="USD">USD ($)</option>
                <option value="RUB">RUB (₽)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Прикрепить файл договора</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px dashed #D1D5DB', borderRadius: 8, cursor: 'pointer', background: '#F9FAFB' }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#2D3170', padding: '4px 12px', border: '1px solid #2D3170', borderRadius: 6, background: '#fff' }}>
                  Выбрать файл
                </span>
                <span style={{ fontSize: 12, color: contractFile ? '#1F2937' : '#9CA3AF' }}>
                  {contractFile ? contractFile.name : 'Файл не выбран'}
                </span>
                <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                  onChange={e => setContractFile(e.target.files?.[0] ?? null)} />
              </label>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Необязательно · PDF, DOC, DOCX</div>
            </div>
          </div>
        )

      case 5:
        return (
          <div>
            <label style={lbl}>Комментарий</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={6}
              style={{ ...inp, resize: 'vertical' }} placeholder="Дополнительные заметки о сотруднике..." />
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
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>Добавить сотрудника</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Person indicator + tab steps */}
        <>
          {view === 'existing' && selected && (
            <div style={{ flexShrink: 0, padding: '10px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                Человек: <strong style={{ color: '#1F2937' }}>{selected.full_name}</strong>
              </span>
              <button onClick={() => { resetFields(); setView('new'); setSelected(null); setTabIdx(0); setSearchExpanded(true) }}
                style={{ fontSize: 11, color: '#4BAED4', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                изменить
              </button>
            </div>
          )}
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

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 8px', minHeight: 480, maxHeight: 600 }}>
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
            {tabIdx < 5 && (
              <button onClick={goNext}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#2D3170', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                Далее
              </button>
            )}
            {tabIdx === 5 && (
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
