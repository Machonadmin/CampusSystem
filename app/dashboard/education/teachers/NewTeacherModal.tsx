'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import type { NewTeacherDept } from './TeachersClient'

/**
 * «מורה חדשה» — создать учительницу прямо с экрана «מורות».
 * Использует тот же POST /api/persons с enroll_as_teacher, что и PersonSelect
 * в карточке группы: person + сотрудник в выбранном подразделении с
 * должностью «Преподаватель». Сервер сам проверяет persons.create на это
 * подразделение — список подразделений здесь лишь подсказка.
 */
export default function NewTeacherModal({
  depts, accent, onClose,
}: { depts: NewTeacherDept[]; accent: string; onClose: () => void }) {
  const t = useTranslations('education.teachers_hub')
  const { lang } = useLang()
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [deptId, setDeptId] = useState(depts.length === 1 ? depts[0].id : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dname = (d: NewTeacherDept) => (lang === 'he' ? (d.name_he || d.name) : lang === 'en' ? (d.name_en || d.name) : d.name)
  const canSave = !!firstName.trim() && !!lastName.trim() && !!deptId && !busy

  async function save() {
    if (!canSave) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          enroll_as_teacher: true,
          department_id: deptId,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        setErr(res.status === 403 ? t('new_teacher_forbidden') : (b.error ?? t('new_teacher_failed')))
        return
      }
      toast(t('new_teacher_created'), 'success')
      onClose()
    } catch {
      setErr(t('new_teacher_failed'))
    } finally {
      setBusy(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13.5, border: '1px solid var(--border-strong)',
    borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }

  return (
    // Стандартный вид Modal (title/footer): отступы тела, ✕ в шапке и
    // закреплённые кнопки даёт сам Modal (заметка 2026-11-10:
    // «ההוספת מורה נראה על הפנים»).
    <Modal
      onClose={onClose}
      maxWidth={440}
      title={t('new_teacher_title')}
      subtitle={t('new_teacher_hint')}
      icon={<UserPlusIcon />}
      footer={<>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            padding: '8px 18px', fontSize: 13.5, fontWeight: 600, color: '#fff', background: accent,
            border: 'none', borderRadius: 8, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.55,
          }}
        >
          {busy ? t('new_teacher_saving') : t('new_teacher_save')}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={label} htmlFor="nt-first">{t('new_teacher_first_name')}</label>
          <input id="nt-first" value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} autoFocus />
        </div>
        <div>
          <label style={label} htmlFor="nt-last">{t('new_teacher_last_name')}</label>
          <input id="nt-last" value={lastName} onChange={e => setLastName(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={label} htmlFor="nt-phone">{t('new_teacher_phone')}</label>
          <input id="nt-phone" value={phone} onChange={e => setPhone(e.target.value)} style={inp} type="tel" dir="ltr" />
        </div>
        <div>
          <label style={label} htmlFor="nt-email">{t('new_teacher_email')}</label>
          <input id="nt-email" value={email} onChange={e => setEmail(e.target.value)} style={inp} type="email" dir="ltr" />
        </div>
        {depts.length > 1 && (
          <div>
            <label style={label} htmlFor="nt-dept">{t('new_teacher_dept')}</label>
            <select id="nt-dept" value={deptId} onChange={e => setDeptId(e.target.value)} style={inp}>
              <option value="">{t('new_teacher_dept_ph')}</option>
              {depts.map(d => <option key={d.id} value={d.id}>{dname(d)}</option>)}
            </select>
          </div>
        )}
        {depts.length === 1 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {t('new_teacher_dept')}: <b style={{ color: 'var(--text)' }}>{dname(depts[0])}</b>
          </div>
        )}
      </div>

      {err && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '7px 10px' }}>{err}</div>
      )}

    </Modal>
  )
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
    </svg>
  )
}
