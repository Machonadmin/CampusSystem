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
    <Modal onClose={onClose} maxWidth={440} ariaLabel={t('new_teacher_title')}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t('new_teacher_title')}</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>{t('new_teacher_hint')}</p>

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

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
        <button
          type="button"
          onClick={onClose}
          style={{ padding: '8px 16px', fontSize: 13.5, fontWeight: 500, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
        >
          {t('new_teacher_cancel')}
        </button>
      </div>
    </Modal>
  )
}
