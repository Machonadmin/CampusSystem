'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toastError } from '@/components/ui/toast'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { getModuleColor } from '@/lib/module-colors'

/**
 * «הוספת בעל תפקיד» — ОДИН экран вместо 3-4 (создание человека, посадка,
 * логин). Оркестрирует всё одним вызовом POST /api/staff/onboard. Только superadmin.
 *
 * Разделы (сверху вниз):
 *   1. Кто это         — существующий (поиск) или новый (имя + телефон).
 *   2. Тפקид ומחלקה    — должность (свободный текст ИЛИ каталог) + юнит + глава.
 *   3. פרטי העסקה      — зарплата (₽), часы, дата (всё опционально).
 *   4. התחברות         — (опц.) логин с автопаролем.
 *
 * Раздела «מה הוא רואה» (роль/права) больше нет — решение владельца: права и
 * роли правятся ТОЛЬКО в «אבטחת מידע». Мастер создаёт человека без роли, а на
 * экране «готово» ведёт туда ссылкой сразу на этого человека.
 */

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null; parent_id?: string | null }
interface Position { id: string; name_ru: string | null; name_he: string | null; category: string }
interface PersonHit { id: string; full_name: string; hebrew_name?: string | null; email: string | null }

export default function RoleSeatWizard({ onClose, onDone, defaultDepartmentId }: {
  onClose: () => void
  onDone: () => void
  /** Открытие из дерева оргструктуры («+ עובד» у подразделения) — юнит уже выбран. */
  defaultDepartmentId?: string
}) {
  const t = useTranslations('staff.wizard')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const accent = getModuleColor('staff')

  // 1 — person
  const [personMode, setPersonMode] = useState<'existing' | 'new'>('existing')
  const [personQ, setPersonQ] = useState('')
  const [personHits, setPersonHits] = useState<PersonHit[]>([])
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [newLast, setNewLast] = useState('')
  const [newFirst, setNewFirst] = useState('')
  const [newMiddle, setNewMiddle] = useState('')
  const [newPhone, setNewPhone] = useState('')
  // Похожие существующие люди при наборе имени нового — защита от дублей у
  // источника (запрос владельца: система сама следит, а не он вручную).
  const [dupHits, setDupHits] = useState<PersonHit[]>([])

  // 2 — role label (position) + department
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [positionInput, setPositionInput] = useState('')
  const [deptId, setDeptId] = useState(defaultDepartmentId ?? '')
  const [isHead, setIsHead] = useState(false)

  // 3 — employment (optional)
  const [salary, setSalary] = useState('')
  const [hours, setHours] = useState('')
  const [hireDate, setHireDate] = useState('')

  // 4 — login
  const [makeLogin, setMakeLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')

  // finish
  const [busy, setBusy] = useState(false)
  const [genPassword, setGenPassword] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  /** person_id из ответа onboard — для ссылки «קבע הרשאות באבטחת מידע». */
  const [donePersonId, setDonePersonId] = useState<string | null>(null)

  useEffect(() => {
    const arr = (d: unknown) => (Array.isArray(d) ? d : [])
    fetch('/api/settings/departments').then(r => r.ok ? r.json() : []).then(d => setDepts(arr(d))).catch(() => {})
    fetch('/api/settings/positions?active_only=true').then(r => r.ok ? r.json() : null).then(d => setPositions(arr((d as { positions?: unknown } | null)?.positions))).catch(() => {})
  }, [])

  // person search (debounced)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (person || personMode !== 'existing') return
    if (timer.current) clearTimeout(timer.current)
    if (personQ.trim().length < 2) { setPersonHits([]); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(personQ)}`)
      if (r.ok) { const d = await r.json(); setPersonHits(Array.isArray(d) ? d : []) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [personQ, person, personMode])

  // duplicate guard: в режиме «новый» ищем похожих по набранному имени
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (personMode !== 'new') { setDupHits([]); return }
    const q = [newLast.trim(), newFirst.trim()].filter(Boolean).join(' ')
    if (dupTimer.current) clearTimeout(dupTimer.current)
    if (q.length < 2) { setDupHits([]); return }
    dupTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(q)}`)
        if (r.ok) { const d = await r.json(); setDupHits(Array.isArray(d) ? d : []) }
      } catch { /* подсказка, не блокер */ }
    }, 350)
    return () => { if (dupTimer.current) clearTimeout(dupTimer.current) }
  }, [newLast, newFirst, personMode])

  const posName = (p: Position) => (lang === 'he' ? p.name_he : p.name_ru) || p.name_he || p.name_ru || ''

  // validity
  const personOk = personMode === 'existing' ? !!person : (newFirst.trim().length > 0 || newLast.trim().length > 0)
  const positionOk = positionInput.trim().length > 0
  const loginOk = !makeLogin || /.+@.+\..+/.test(loginEmail.trim())
  const canCreate = personOk && positionOk && !!deptId && loginOk

  async function finish() {
    if (busy || !canCreate) return
    setBusy(true)
    try {
      // 1) position: match catalog by name → position_id, else free-text label
      const typed = positionInput.trim()
      const matched = positions.find(p => posName(p).trim() === typed)

      // 2) onboard (single call) — без роли: права задаются в «אבטחת מידע»
      const payload: Record<string, unknown> = {
        department_id: deptId,
        is_head: isHead,
        hire_date: hireDate || null,
        login_email: makeLogin && loginEmail.trim() ? loginEmail.trim() : undefined,
      }
      if (matched) payload.position_id = matched.id
      else payload.position_label = typed
      if (salary.trim()) payload.salary = Number(salary)
      if (hours.trim()) payload.hours = Number(hours)
      if (personMode === 'existing') payload.person_id = person!.id
      else {
        payload.first_name = newFirst.trim()
        payload.last_name = newLast.trim()
        payload.middle_name = newMiddle.trim()
        payload.phone = newPhone.trim()
      }

      const res = await fetch('/api/staff/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? t('err_onboard')); setBusy(false); return }
      const d = await res.json().catch(() => ({})) as { generated_password?: string; person_id?: string }
      if (d.generated_password) setGenPassword(d.generated_password)
      if (d.person_id) setDonePersonId(d.person_id)
      setDone(true)
      onDone()
    } finally { setBusy(false) }
  }

  const personName = personMode === 'existing'
    ? (person?.full_name ?? '')
    : [newFirst, newLast].filter(Boolean).join(' ')

  // ── styles ──
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '9px 11px', fontSize: 13.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, display: 'block' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? accent : 'var(--border-strong)'}`, background: active ? accent : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)' })
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }
  const optBadge = <span style={{ fontSize: 11, color: 'var(--text-faint)', border: '1px dashed var(--border-strong)', borderRadius: 99, padding: '1px 8px', fontWeight: 600, marginInlineStart: 6 }}>{t('optional_badge')}</span>

  function SectionHead({ n, title, badge }: { n: number; title: string; badge?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, background: 'var(--accent-tint)', color: accent, fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center' }}>{n}</span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {badge && optBadge}
      </div>
    )
  }
  const sectionWrap: React.CSSProperties = { padding: '16px 0', borderBottom: '1px solid var(--border)' }

  return (
    <Modal onClose={onClose} maxWidth={620} panelStyle={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{t('screen_title')}</div>
          {!done && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('screen_sub')}</div>}
        </div>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', padding: '4px 20px 8px', flex: 1 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{t('done_title')}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>{t('done_created').replace('{name}', personName || '—')}</div>
            {genPassword && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--accent-tint)', border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('generated_password')}</div>
                <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--text)', direction: 'ltr', unicodeBidi: 'isolate' }}>{genPassword}</code>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_hint')}</div>
              </div>
            )}
            {/* Права в мастере не задаются — ведём туда, где их утверждают. */}
            <div style={{ marginTop: 16 }}>
              <Link
                href={donePersonId
                  ? `/dashboard/data-security?tab=person&person=${encodeURIComponent(donePersonId)}`
                  : '/dashboard/data-security'}
                onClick={onClose}
                style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 9, border: `1px solid ${accent}`, background: 'var(--accent-tint)', color: accent, fontSize: 13.5, fontWeight: 700 }}
              >{t('set_permissions_link')}</Link>
            </div>
          </div>
        ) : (
          <>
            {/* 1 — who */}
            <div style={sectionWrap}>
              <SectionHead n={1} title={t('sec_who')} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setPersonMode('existing')} style={chip(personMode === 'existing')}>{t('who_existing')}</button>
                <button onClick={() => setPersonMode('new')} style={chip(personMode === 'new')}>{t('who_new')}</button>
              </div>
              {personMode === 'existing' ? (
                <div style={{ position: 'relative' }}>
                  <input aria-label={t('person_ph')} value={person ? person.full_name : personQ} onChange={e => { setPerson(null); setPersonQ(e.target.value) }} placeholder={t('person_ph')} style={inp} />
                  {!person && personQ.trim().length >= 2 && personHits.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 20, insetInlineStart: 0, insetInlineEnd: 0, top: '100%', marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
                      {personHits.map(h => (
                        <div key={h.id} role="button" tabIndex={0} onClick={() => { setPerson(h); setPersonQ(''); if (h.email && !loginEmail) setLoginEmail(h.email) }}
                          onKeyDown={e => { if (e.key === 'Enter') { setPerson(h); setPersonQ('') } }}
                          style={{ padding: '8px 11px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{h.full_name}{h.email ? ` · ${h.email}` : ''}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={row2}>
                    <div><label style={label}>{t('fn_last')}</label><input aria-label={t('fn_last')} value={newLast} onChange={e => setNewLast(e.target.value)} style={inp} dir="rtl" /></div>
                    <div><label style={label}>{t('fn_first')}</label><input aria-label={t('fn_first')} value={newFirst} onChange={e => setNewFirst(e.target.value)} style={inp} dir="rtl" /></div>
                  </div>
                  <div style={row2}>
                    <div><label style={label}>{t('fn_middle')}</label><input aria-label={t('fn_middle')} value={newMiddle} onChange={e => setNewMiddle(e.target.value)} style={inp} dir="rtl" /></div>
                    <div><label style={label}>{t('fn_phone')}</label><input aria-label={t('fn_phone')} value={newPhone} onChange={e => setNewPhone(e.target.value)} style={inp} dir="ltr" inputMode="tel" /></div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t('new_person_hint')}</div>
                  {dupHits.length > 0 && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--warn-tint)', border: '1px solid var(--warn)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn)', marginBottom: 6 }}>{t('dup_warn')}</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {dupHits.slice(0, 4).map(h => (
                          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {h.full_name}{h.email ? ` · ${h.email}` : ''}
                            </span>
                            <button
                              onClick={() => {
                                setPersonMode('existing'); setPerson(h); setPersonQ('')
                                if (h.email && !loginEmail) setLoginEmail(h.email)
                              }}
                              style={{ flex: 'none', padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer', background: 'var(--surface)', color: accent, border: `1px solid ${accent}` }}
                            >{t('dup_pick')}</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2 — position + department */}
            <div style={sectionWrap}>
              <SectionHead n={2} title={t('sec_role_dept')} />
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={label}>{t('position_combo')} *</label>
                  <input aria-label={t('position_combo')} value={positionInput} onChange={e => setPositionInput(e.target.value)} placeholder={t('position_combo_ph')} list="positions-list" style={inp} dir="rtl" />
                  <datalist id="positions-list">
                    {positions.map(p => <option key={p.id} value={posName(p)} />)}
                  </datalist>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('position_combo_hint')}</div>
                </div>
                <div>
                  <label style={label}>{t('department')} *</label>
                  <select aria-label={t('department')} value={deptId} onChange={e => setDeptId(e.target.value)} style={inp}>
                    <option value="">—</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
                  </select>
                  {depts.length === 0 && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6, fontWeight: 600 }}>{t('empty_list_hint')}</div>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} style={{ accentColor: accent }} />
                  {t('is_head')}
                </label>
              </div>
            </div>

            {/* 3 — employment */}
            <div style={sectionWrap}>
              <SectionHead n={3} title={t('sec_employment')} badge />
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={row2}>
                  <div><label style={label}>{t('salary')}</label><input aria-label={t('salary')} value={salary} onChange={e => setSalary(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('salary_ph')} style={inp} inputMode="numeric" dir="ltr" /></div>
                  <div><label style={label}>{t('hours')}</label><input aria-label={t('hours')} value={hours} onChange={e => setHours(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('hours_ph')} style={inp} inputMode="numeric" dir="ltr" /></div>
                </div>
                <div>
                  <label style={label}>{t('hire_date')}</label>
                  <input aria-label={t('hire_date')} type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={inp} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('hire_date_hint')}</div>
                </div>
              </div>
            </div>

            {/* 4 — login */}
            <div style={{ padding: '16px 0 4px' }}>
              <SectionHead n={4} title={t('sec_login')} badge />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={makeLogin} onChange={e => setMakeLogin(e.target.checked)} style={{ accentColor: accent }} />
                {t('make_login')}
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{t('make_login_hint')}</div>
              {makeLogin && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>{t('login_email')} *</label>
                  <input aria-label={t('login_email')} value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="name@example.com" dir="ltr" style={{ ...inp, textAlign: 'start' }} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_auto')}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {done ? (
          <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{t('finish_close')}</button>
        ) : (
          <>
            <button onClick={onClose} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, cursor: 'pointer' }}>{tCommon('cancel')}</button>
            <SubmitButton onClick={finish} loading={busy} disabled={!canCreate || busy}
              style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: (!canCreate || busy) ? 'var(--border)' : accent, color: (!canCreate || busy) ? 'var(--text-faint)' : '#fff', fontSize: 13.5, fontWeight: 600, cursor: (!canCreate || busy) ? 'not-allowed' : 'pointer' }}>
              {t('create_holder')}
            </SubmitButton>
          </>
        )}
      </div>
    </Modal>
  )
}
