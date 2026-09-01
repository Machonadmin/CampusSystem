'use client'

import { Modal } from '@/components/ui/Modal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { roleLabel } from '@/lib/roles/role-label'
import { getModuleColor } from '@/lib/module-colors'
import { personDisplayName } from '@/lib/persons/name'
import { PhoneLink } from '@/components/ui/PhoneLink'
import type { UserRow } from '@/app/dashboard/settings/users/UsersAccessPanel'

/**
 * «Карточка сотрудника» — ВСЁ об одном сотруднике в одном месте (запрос
 * владельца: «ניהול עובדים» вместо разбросанных модалок и скрытого меню ⋯):
 * посадки, контакты, доступ (роли/логин/личные права), «смотреть как он»,
 * правка и удаление. Открывается кликом по строке списка.
 * Сами действия переиспользуют существующие модалки — карточка их хаб.
 */

export interface CardSeat {
  position_id: string
  profile_id: string | null
  position: string
  department_name: string | null
  is_head: boolean
  hire_date: string | null
  employment_type: string | null
}

export interface CardPerson {
  person_id: string
  full_name: string
  hebrew_name?: string | null
  photo_url: string | null
  phone: string | null
  email: string | null
  status?: string | null
}

interface Props {
  person: CardPerson
  seats: CardSeat[]
  user: UserRow | null
  isSuperadmin: boolean
  onClose: () => void
  onEditDetails: (() => void) | null
  onManageRoles: (() => void) | null
  onEditAccount: (() => void) | null
  onPersonalPrivs: (() => void) | null
  onCreateLogin: (() => void) | null
  onViewAs: (() => void) | null
  onDelete: (() => void) | null
}

export default function EmployeeCard({
  person, seats, user, isSuperadmin, onClose,
  onEditDetails, onManageRoles, onEditAccount, onPersonalPrivs, onCreateLogin, onViewAs, onDelete,
}: Props) {
  const t = useTranslations('staff')
  const tUsers = useTranslations('settings.users')
  const tPriv = useTranslations('settings.person_privileges')
  const tCommon = useTranslations('common')
  const { t: pack } = useLang()
  const accent = getModuleColor('staff')
  const rolesPack = (pack.roles as Record<string, string>) ?? {}

  const initials = person.full_name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()

  const secTitle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }
  const section: React.CSSProperties = { padding: '14px 0', borderTop: '1px solid var(--border)' }
  const actBtn: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', background: 'var(--surface)', color: accent, border: `1px solid ${accent}` }

  return (
    <Modal onClose={onClose} maxWidth={560} panelStyle={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {person.photo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={person.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 52, height: 52, borderRadius: '50%', background: getModuleColor('staff', 'light'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: accent, flexShrink: 0 }}>{initials || '?'}</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{personDisplayName(person)}</div>
          {person.hebrew_name && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{person.hebrew_name}</div>}
        </div>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 20px 6px', flex: 1 }}>
        {/* seats */}
        <div style={{ ...section, borderTop: 'none', paddingTop: 4 }}>
          <div style={secTitle}>{t('card.sec_seats')}</div>
          {seats.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.no_seats')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {seats.map(s => (
                <div key={s.position_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.position}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.department_name && <span>{s.department_name}</span>}
                      {s.is_head && <span style={{ color: '#4BAED4', fontWeight: 600 }}>{t('dept.head_label')}</span>}
                      {s.hire_date && <span style={{ color: 'var(--text-faint)' }}>· {s.hire_date}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {onEditDetails && (
            <button onClick={onEditDetails} style={{ ...actBtn, marginTop: 10 }}>{t('card.edit_details')}</button>
          )}
        </div>

        {/* contact */}
        <div style={section}>
          <div style={secTitle}>{t('card.sec_contact')}</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--text)' }}>
            <span>{person.phone ? <PhoneLink phone={person.phone} /> : '—'}</span>
            <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{person.email ?? '—'}</span>
          </div>
        </div>

        {/* access */}
        <div style={section}>
          <div style={secTitle}>{t('card.sec_access')}</div>
          {user ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: 'var(--text)', direction: 'ltr', unicodeBidi: 'isolate' }}>{user.login_email}</span>
                <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 600, background: user.is_active ? 'var(--success-tint)' : 'var(--surface-2)', color: user.is_active ? 'var(--success)' : 'var(--text-faint)' }}>
                  {user.is_active ? t('card.login_active') : t('card.login_inactive')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {user.roles.length === 0
                  ? <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('access_no_roles')}</span>
                  : user.roles.map(r => (
                    <span key={r.id} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 99, background: 'var(--accent-tint)', color: accent, fontWeight: 600 }}>
                      {roleLabel(rolesPack, r.code, r.name)}
                    </span>
                  ))}
              </div>
              {isSuperadmin && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {onManageRoles && <button onClick={onManageRoles} style={actBtn}>{tUsers('manage_roles_button')}</button>}
                  {onEditAccount && <button onClick={onEditAccount} style={actBtn}>{tUsers('edit_button')}</button>}
                  {onPersonalPrivs && <button onClick={onPersonalPrivs} style={actBtn}>{tPriv('button')}</button>}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.no_login')}</div>
              {isSuperadmin && onCreateLogin && (
                <button onClick={onCreateLogin} style={{ ...actBtn, justifySelf: 'start' }}>{t('create_login')}</button>
              )}
            </div>
          )}
          {isSuperadmin && onViewAs && (
            <button onClick={onViewAs} style={{ ...actBtn, marginTop: 10, background: 'var(--accent-tint)', borderColor: 'transparent' }}>
              👁 {t('view_as')}
            </button>
          )}
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {onDelete ? (
          <button onClick={onDelete} style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'none', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
            {tCommon('delete')}
          </button>
        ) : <span />}
        <button onClick={onClose} style={{ fontSize: 13.5, fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: accent, color: '#fff', border: 'none' }}>
          {tCommon('close')}
        </button>
      </div>
    </Modal>
  )
}
