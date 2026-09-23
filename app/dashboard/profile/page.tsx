'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { useRouter } from 'next/navigation'
import { useMe } from '@/lib/hooks/useMe'
import { useUiPrefs } from '@/lib/prefs/UiPrefsContext'
import {
  DEFAULT_UI_PREFS, moveItem, sanitizeUiPrefs, toggleFavorite, toggleHidden,
  type UiPrefs, type WidgetId,
} from '@/lib/prefs/ui-prefs'
import { accessibleNavGroups } from '@/lib/prefs/nav-items'
import { usePushControls } from '@/lib/push/usePushControls'
import { applyTheme, readTheme, THEME_EVENT, type Theme } from '@/lib/theme'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toastError } from '@/components/ui/toast'
import ChangePasswordModal from '@/components/ChangePasswordModal'

/**
 * «הפרופיל שלי» — личный экран сотрудника: его данные, язык и тема, пароль,
 * пуши на телефон и ЛИЧНАЯ РАСКЛАДКА (избранное / скрытое в меню, блоки и
 * плитки главной). Раскладка хранится на сервере (user_preferences) и
 * одинакова на всех устройствах.
 *
 * Права здесь не меняются: список пунктов — ровно то, что человек видит в меню
 * (lib/prefs/nav-items.ts). Скрыть пункт — не значит потерять доступ.
 */

const LANGS = [
  { code: 'he', label: 'עברית' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
] as const

const WIDGET_LABEL_KEY: Record<WidgetId, string> = {
  agenda: 'agenda_title',
  pending_signatures: 'pending_signatures',
  my_tasks: 'my_tasks',
  my_maintenance: 'my_maintenance',
  my_lessons: 'my_lessons_today',
  recent_leads: 'recent_leads',
  stalled: 'stalled',
}

export default function ProfilePage() {
  const t = useTranslations('prefs')
  const tHome = useTranslations('home')
  const tNotif = useTranslations('notifications')
  const tFin = useTranslations('finance')
  const { t: tr, lang, setLang } = useLang()
  const router = useRouter()
  const me = useMe()
  const { prefs, loaded, persisted, save } = useUiPrefs()
  const push = usePushControls()

  const [eduAccess, setEduAccess] = useState<Record<string, boolean> | null>(null)
  const [theme, setTheme] = useState<Theme | null>(null)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/education/tab-access')
      .then(r => (r.ok ? r.json() : {}))
      .then(a => { if (alive) setEduAccess((a && typeof a === 'object' ? a : {}) as Record<string, boolean>) })
      .catch(() => { if (alive) setEduAccess({}) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setTheme(readTheme())
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])

  const navLabel = (id: string) =>
    id === 'finance_staff' ? tFin('staff.link_label') : ((tr.nav as Record<string, string>)[id] ?? id)

  const groups = me && eduAccess !== null
    ? accessibleNavGroups({
        accessible_modules: me.accessible_modules ?? [],
        is_chavruta_teacher: me.is_chavruta_teacher,
        can_view_chavruta: me.can_view_chavruta,
        can_view_staff_comp: me.can_view_staff_comp,
      }, eduAccess)
    : null
  const availableIds = new Set((groups ?? []).flatMap(g => g.ids))
  // Избранное показываем только из доступного (право могли отобрать).
  const favorites = prefs.favorites.filter(id => availableIds.has(id))
  const canEdit = loaded && persisted && !busy

  async function commit(next: UiPrefs) {
    setBusy(true)
    const r = await save(sanitizeUiPrefs(next))
    setBusy(false)
    if (!r.ok) toastError(r.error ?? t('save_failed'))
  }

  function moveFavorite(id: string, dir: -1 | 1) {
    // Двигаем внутри видимого избранного; недоступные id остаются в хвосте.
    const moved = moveItem(favorites, id, dir)
    const rest = prefs.favorites.filter(x => !availableIds.has(x))
    commit({ ...prefs, favorites: [...moved, ...rest] })
  }

  function moveWidget(id: WidgetId, dir: -1 | 1) {
    commit({ ...prefs, widgets: { ...prefs.widgets, order: moveItem(prefs.widgets.order, id, dir) } })
  }

  function toggleWidget(id: WidgetId) {
    const hidden = prefs.widgets.hidden.includes(id)
      ? prefs.widgets.hidden.filter(x => x !== id)
      : [...prefs.widgets.hidden, id]
    commit({ ...prefs, widgets: { ...prefs.widgets, hidden } })
  }

  return (
    <div className="p-6 space-y-6" style={{ maxWidth: 900 }}>
      <ModuleHeader module="dashboard" title={t('profile_title')} subtitle={t('profile_subtitle')} />

      {/* ── Мои данные ── */}
      <Section title={t('section_details')}>
        {me ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 16px', margin: 0, fontSize: 14 }}>
            <dt style={{ color: 'var(--text-muted)' }}>{t('label_name')}</dt>
            <dd style={{ margin: 0, color: 'var(--text)', fontWeight: 600 }}>{me.full_name ?? '—'}</dd>
            {me.login_email && (<>
              <dt style={{ color: 'var(--text-muted)' }}>{t('label_email')}</dt>
              <dd style={{ margin: 0, color: 'var(--text)', direction: 'ltr', textAlign: 'start' }}>{me.login_email}</dd>
            </>)}
            {(me.position_title || me.roles.length > 0) && (<>
              <dt style={{ color: 'var(--text-muted)' }}>{t('label_position')}</dt>
              <dd style={{ margin: 0, color: 'var(--text)' }}>
                {me.position_title || me.roles.map(r => (tr.roles as Record<string, string>)[r] ?? r).join(', ')}
              </dd>
            </>)}
          </dl>
        ) : (
          <Skeleton width="60%" height={14} />
        )}
      </Section>

      {/* ── Вид: язык и тема ── */}
      <Section title={t('section_display')}>
        <Field label={t('language')}>
          <Segmented
            options={LANGS.map(l => ({ value: l.code, label: l.label }))}
            value={lang}
            onChange={v => { setLang(v as typeof lang); router.refresh() }}
          />
        </Field>
        <Field label={t('theme')}>
          <Segmented
            options={[{ value: 'light', label: t('theme_light') }, { value: 'dark', label: t('theme_dark') }]}
            value={theme ?? ''}
            onChange={v => applyTheme(v as Theme)}
          />
        </Field>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{t('display_device_note')}</p>
      </Section>

      {/* ── Пароль ── */}
      <Section title={t('section_security')}>
        <div>
          <Button onClick={() => setPwdOpen(true)}>{tr.user.changePassword}</Button>
        </div>
      </Section>

      {/* ── Пуши на телефон (это устройство) ── */}
      <Section title={t('section_push')}>
        <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>
          {push.pushState === 'subscribed' ? tNotif('push_active')
            : push.pushState === 'available' ? tNotif('push_prompt')
            : push.pushState === 'ios-needs-install' ? tNotif('push_ios_install')
            : push.pushState === 'denied' ? tNotif('push_denied')
            : tNotif('push_unsupported')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {push.pushState === 'available' && (
            <Button variant="primary" onClick={push.onEnablePush} disabled={push.pushBusy}>{tNotif('push_enable')}</Button>
          )}
          {push.pushState === 'subscribed' && (
            <Button onClick={push.onTestPush} disabled={push.pushBusy}>{tNotif('push_test')}</Button>
          )}
        </div>
      </Section>

      {/* ── Личная раскладка ── */}
      <div id="layout" style={{ scrollMarginTop: 80 }}>
        <Section title={t('section_layout')}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{t('layout_hint')}</p>
          {loaded && !persisted && (
            <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--warn-tint)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
              {t('not_migrated')}
            </div>
          )}

          {/* Избранное — порядок = порядок в меню и на главной. */}
          <SubTitle>{t('favorites_group')}</SubTitle>
          {favorites.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{t('favorites_empty')}</p>
          ) : (
            <List>
              {favorites.map((id, i) => (
                <Row key={id} label={navLabel(id)}>
                  <IconBtn label={t('move_up')} disabled={!canEdit || i === 0} onClick={() => moveFavorite(id, -1)} path="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  <IconBtn label={t('move_down')} disabled={!canEdit || i === favorites.length - 1} onClick={() => moveFavorite(id, 1)} path="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  <IconBtn label={t('unfavorite')} disabled={!canEdit} onClick={() => commit(toggleFavorite(prefs, id))} path={STAR} active />
                </Row>
              ))}
            </List>
          )}

          {/* Все доступные пункты меню, по группам как в меню. */}
          <SubTitle>{t('menu_items')}</SubTitle>
          {groups === null ? (
            <Skeleton width="100%" height={120} radius={12} />
          ) : groups.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{tr.noModules}</p>
          ) : (
            groups.map(g => (
              <div key={g.group}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '4px 0 6px' }}>
                  {(tr.nav_groups as Record<string, string>)[g.group] ?? g.group}
                </div>
                <List>
                  {g.ids.map(id => {
                    const isFav = prefs.favorites.includes(id)
                    const isHidden = prefs.hidden.includes(id)
                    return (
                      <Row key={id} label={navLabel(id)} dim={isHidden} note={isHidden ? t('hidden_note') : undefined}>
                        <IconBtn label={isFav ? t('unfavorite') : t('favorite')} disabled={!canEdit} onClick={() => commit(toggleFavorite(prefs, id))} path={STAR} active={isFav} />
                        <IconBtn label={isHidden ? t('show') : t('hide')} disabled={!canEdit} onClick={() => commit(toggleHidden(prefs, id))} path={isHidden ? EYE_OFF : EYE} />
                      </Row>
                    )
                  })}
                </List>
              </div>
            ))
          )}

          {/* Блоки «העבודה שלי» на главной. */}
          <SubTitle>{t('widgets_title')}</SubTitle>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{t('widgets_hint')}</p>
          <List>
            {prefs.widgets.order.map((id, i) => {
              const shown = !prefs.widgets.hidden.includes(id)
              return (
                <Row key={id} label={tHome(WIDGET_LABEL_KEY[id])} dim={!shown}>
                  <IconBtn label={t('move_up')} disabled={!canEdit || i === 0} onClick={() => moveWidget(id, -1)} path="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  <IconBtn label={t('move_down')} disabled={!canEdit || i === prefs.widgets.order.length - 1} onClick={() => moveWidget(id, 1)} path="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  <IconBtn label={shown ? t('hide') : t('show')} disabled={!canEdit} onClick={() => toggleWidget(id)} path={shown ? EYE : EYE_OFF} />
                </Row>
              )
            })}
          </List>

          {/* Плитки модулей на главной. */}
          <SubTitle>{t('tiles_title')}</SubTitle>
          <Segmented
            options={[{ value: 'all', label: t('tiles_all') }, { value: 'favorites', label: t('tiles_favorites') }]}
            value={prefs.tiles}
            disabled={!canEdit}
            onChange={v => commit({ ...prefs, tiles: v === 'favorites' ? 'favorites' : 'all' })}
          />

          <div>
            <Button variant="ghost" disabled={!canEdit} onClick={() => commit(DEFAULT_UI_PREFS)}>{t('reset')}</Button>
          </div>
        </Section>
      </div>

      {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
    </div>
  )
}

// ── Мелкие элементы экрана ───────────────────────────────────────────────────

const STAR = 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z'
const EYE = 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
const EYE_OFF = 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px', boxShadow: 'var(--shadow)', display: 'grid', gap: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h2>
      {children}
    </section>
  )
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '8px 0 0' }}>{children}</h3>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 90 }}>{label}</span>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange, disabled }: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', opacity: disabled ? 0.6 : 1 }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => { if (!on) onChange(o.value) }}
            style={{
              padding: '7px 14px', fontSize: 13, fontWeight: on ? 700 : 500, border: 'none',
              background: on ? 'var(--accent-tint)' : 'transparent',
              color: on ? 'var(--accent-strong)' : 'var(--text-muted)',
              cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function List({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>{children}</div>
}

function Row({ label, children, dim, note }: { label: string; children: ReactNode; dim?: boolean; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: dim ? 'var(--text-faint)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
        {note && <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginInlineStart: 8 }}>{note}</span>}
      </span>
      {children}
    </div>
  )
}

function IconBtn({ label, path, onClick, disabled, active }: { label: string; path: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="icon-ghost"
      style={{
        width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active ? 'var(--warn)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1,
      }}
    >
      <svg style={{ width: 17, height: 17 }} fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={path} />
      </svg>
    </button>
  )
}
