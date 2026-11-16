'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { parseCsv, contactsFromTable, MAX_IMPORT_ROWS, type ContactGroup, type ContactKind, type PrivateContactInput } from '@/lib/meetings/contacts'
import { card, label, input, muted, sectionTitle, tabBtn, send, isoTime, PeoplePicker, type PersonRef } from './meetings-ui'

// ═════════════════════════════════════════════════════════════════════════════
// אנשי קשר: группы, фото, технические данные; המנהל видит ещё встречи и заметки
// ═════════════════════════════════════════════════════════════════════════════

interface Contact {
  kind: ContactKind
  id: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  department: string | null
  group_name: string | null
  year: string | null
  track: string | null
  position: string | null
  category: string | null
  photo_url: string | null
  owner_name?: string | null
  shared?: boolean
}

interface Meta { role: 'director' | 'secretary' | null; groups: ContactGroup[]; migrated: boolean; can_see_notes: boolean }

export default function ContactsTab() {
  const t = useTranslations('meetings_mgr')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [group, setGroup] = useState<ContactGroup | null>(null)
  const [list, setList] = useState<Contact[] | null>(null)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<{ kind: ContactKind; id: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    fetch('/api/meetings/contacts', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((m: Meta) => { setMeta(m); setGroup(m.groups[0] ?? null) })
      .catch(() => toastError(t('load_error')))
  }, [t])

  const load = useCallback(async () => {
    if (!group) return
    setList(null)
    const r = await fetch(`/api/meetings/contacts?group=${group}`, { cache: 'no-store' })
    if (!r.ok) { setList([]); toastError(t('load_error')); return }
    setList((await r.json()).contacts ?? [])
  }, [group, t])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return list ?? []
    return (list ?? []).filter(c => [c.name, c.phone, c.email, c.city, c.department, c.group_name, c.track, c.position, c.category]
      .some(v => (v ?? '').toLowerCase().includes(s)))
  }, [list, q])

  if (!meta) return <Skeleton height={120} />
  if (!group) return <EmptyState text={t('contacts_no_access')} />

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {meta.role === 'secretary' && <div style={{ ...muted, fontSize: 13 }}>{t('contacts_secretary_note')}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {meta.groups.map(g => (
          <button key={g} type="button" style={tabBtn(g === group)} onClick={() => { setGroup(g); setQ('') }}>{t(`contacts_group_${g}`)}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...input, maxWidth: 320 }} value={q} onChange={e => setQ(e.target.value)} placeholder={t('contacts_search')} />
        {list && <span style={muted}>{fill(t('contacts_count'), { n: shown.length })}</span>}
        <div style={{ flex: 1 }} />
        {group === 'private' && meta.role && meta.migrated && (
          <>
            <Button onClick={() => setImporting(true)}>{t('contacts_import')}</Button>
            <Button variant="primary" onClick={() => setAdding(true)}>{t('contacts_add')}</Button>
          </>
        )}
      </div>
      {group === 'private' && !meta.migrated && <div style={card}>{t('contacts_not_migrated')}</div>}
      {group === 'private' && meta.migrated && <div style={muted}>{t('contacts_private_note')}</div>}

      {list === null ? <Skeleton height={160} /> : shown.length === 0 ? <EmptyState text={t('contacts_empty')} /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(c => (
            <button key={`${c.kind}:${c.id}`} type="button" onClick={() => setOpenId({ kind: c.kind, id: c.id })}
              style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 10, cursor: 'pointer', textAlign: 'start', color: 'var(--text)' }}>
              <Avatar name={c.name} url={c.photo_url} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.name}
                  {c.shared && <Badge tone="info" label={t('contacts_shared_badge')} />}
                  {c.owner_name && <Badge tone="neutral" label={fill(t('contacts_from'), { name: c.owner_name })} />}
                </div>
                <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {subLine(c, t).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'end', fontSize: 12.5, color: 'var(--text-muted)', minWidth: 0 }}>
                {c.phone && <div dir="ltr">{c.phone}</div>}
                {c.email && <div dir="ltr" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{c.email}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {openId && (
        <ContactModal kind={openId.kind} id={openId.id} onClose={() => setOpenId(null)} onChanged={load} />
      )}
      {adding && <AddPrivateModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
    </div>
  )
}

type T = ReturnType<typeof useTranslations>

/** Подстановка {n}/{name} в строку перевода. */
function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), text)
}

function subLine(c: Contact, t: T): string[] {
  return [
    c.department, c.group_name, c.year ? fill(t('contacts_year_value'), { y: c.year }) : null, c.track, c.position,
    c.category ? (c.kind === 'sponsor' ? t(`contacts_sponsor_${c.category}`) : c.category) : null, c.city,
  ].filter((x): x is string => !!x)
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('')
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
    background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: size / 2.8, color: 'var(--text-muted)',
  }
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" style={{ ...box, objectFit: 'cover' }} /> : <div style={box}>{initials(name)}</div>
}

// ── Карточка контакта ────────────────────────────────────────────────────────

interface Detail {
  contact: Contact
  can_edit: boolean
  is_owner: boolean
  notes?: string | null
  family?: { marital_status: string | null; birth_date: string | null }
  meetings?: Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>
  donations?: { total_received: number; items: Array<{ id: string; amount: number | string; donation_date: string; purpose: string | null; status: string }> }
  shared_with?: PersonRef[]
}

function ContactModal({ kind, id, onClose, onChanged }: { kind: ContactKind; id: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const router = useRouter()
  const [d, setD] = useState<Detail | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [shared, setShared] = useState<PersonRef[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const url = `/api/meetings/contacts/${kind}/${id}`
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  const load = useCallback(async () => {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) { toastError(t('load_error')); closeRef.current(); return }
    const b = (await r.json()) as Detail
    setD(b)
    const c = b.contact
    setForm({
      name: c.name, phone: c.phone ?? '', email: c.email ?? '', city: c.city ?? '',
      organization: c.department ?? '', role_title: c.position ?? '', category: c.category ?? '', notes: b.notes ?? '',
    })
    setShared(b.shared_with ?? [])
  }, [url, t])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!d) return
    if (!form.name.trim()) { toastError(t('contacts_err_name')); return }
    setBusy(true)
    const body = kind === 'private'
      ? {
        full_name: form.name, phone: form.phone, email: form.email, city: form.city, organization: form.organization,
        role_title: form.role_title, category: form.category, notes: form.notes, shared_with: shared.map(p => p.id),
      }
      : { name: form.name, phone: form.phone, email: form.email, city: form.city }
    const r = await send(url, 'PATCH', body)
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('saved'))
    onChanged()
    onClose()
  }

  async function uploadPhoto(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    setBusy(true)
    const r = await fetch(`${url}/photo`, { method: 'POST', body: fd })
    setBusy(false)
    if (!r.ok) { toastError(String((await r.json().catch(() => ({}))).error ?? t('action_failed'))); return }
    await load()
    onChanged()
  }

  async function removePhoto() {
    setBusy(true)
    const r = await send(`${url}/photo`, 'DELETE')
    setBusy(false)
    if (!r.ok) { toastError(t('action_failed')); return }
    await load()
    onChanged()
  }

  async function remove() {
    setBusy(true)
    const r = await send(url, 'DELETE')
    setBusy(false)
    if (!r.ok) { toastError(t('action_failed')); return }
    onChanged()
    onClose()
  }

  const c = d?.contact
  const editable = !!d?.can_edit
  const field = (key: string, text: string, opts?: { ltr?: boolean; area?: boolean }) => (
    <div>
      <span style={label}>{text}</span>
      {opts?.area
        ? <textarea style={{ ...input, minHeight: 80 }} value={form[key] ?? ''} disabled={!editable} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        : <input style={input} dir={opts?.ltr ? 'ltr' : undefined} value={form[key] ?? ''} disabled={!editable} onChange={e => setForm({ ...form, [key]: e.target.value })} />}
    </div>
  )
  const ro = (text: string, value: string | null | undefined) => value ? (
    <div><span style={label}>{text}</span><div style={{ fontSize: 13.5 }}>{value}</div></div>
  ) : null

  return (
    <Modal onClose={onClose} title={c?.name ?? t('contacts_title')} maxWidth={620}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>{d?.is_owner && <Button variant="ghost" disabled={busy} onClick={remove}>{t('contacts_delete')}</Button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose}>{t('cancel')}</Button>
          {editable && <Button variant="primary" disabled={busy} onClick={save}>{t('save')}</Button>}
        </div>
      </div>}>
      {!d || !c ? <Skeleton height={200} /> : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Avatar name={c.name} url={c.photo_url} size={84} />
            {editable && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = '' }} />
                <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>{t('contacts_photo_upload')}</Button>
                {c.photo_url && <Button size="sm" variant="ghost" disabled={busy} onClick={removePhoto}>{t('contacts_photo_remove')}</Button>}
              </div>
            )}
            {c.owner_name && <span style={muted}>{fill(t('contacts_from'), { name: c.owner_name })}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {field('name', t('contacts_name'))}
            {field('phone', t('contacts_phone'), { ltr: true })}
            {field('email', t('contacts_email'), { ltr: true })}
            {field('city', kind === 'sponsor' ? t('contacts_address') : t('contacts_city'))}
            {kind === 'private' && field('organization', t('contacts_organization'))}
            {kind === 'private' && field('role_title', t('contacts_role'))}
            {kind === 'private' && field('category', t('contacts_category'))}
          </div>

          {kind !== 'private' && (c.department || c.group_name || c.year || c.track || c.position) && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {ro(t('contacts_department'), c.department)}
                {ro(t('contacts_group'), c.group_name)}
                {ro(t('contacts_year'), c.year)}
                {ro(t('contacts_track'), c.track)}
                {ro(t('contacts_position'), c.position)}
              </div>
              <div style={{ ...muted, marginTop: 6 }}>{t('contacts_study_readonly')}</div>
            </div>
          )}

          {kind === 'private' && d.is_owner && (
            <>
              {field('notes', t('contacts_notes'), { area: true })}
              <div>
                <span style={label}>{t('contacts_share_with')}</span>
                <PeoplePicker value={shared} onChange={setShared} placeholder={t('contacts_share_placeholder')} />
                <div style={{ ...muted, marginTop: 4 }}>{t('contacts_share_hint')}</div>
              </div>
            </>
          )}

          {kind !== 'private' && d.notes !== undefined && (
            <div style={card}>
              <h4 style={sectionTitle}>{t('contacts_notes')}</h4>
              <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{d.notes || '—'}</div>
              {d.family && (d.family.marital_status || d.family.birth_date) && (
                <div style={{ ...muted, marginTop: 8 }}>
                  {[d.family.marital_status && `${t('contacts_marital')}: ${d.family.marital_status}`,
                    d.family.birth_date && `${t('contacts_birth')}: ${formatDate(d.family.birth_date, lang)}`].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          )}

          {d.donations && (
            <div style={card}>
              <h4 style={sectionTitle}>{t('contacts_donations')} · {fill(t('contacts_donations_total'), { n: d.donations.total_received.toLocaleString() })}</h4>
              {d.donations.items.length === 0 ? <div style={muted}>—</div> : d.donations.items.map(x => (
                <div key={x.id} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                  <span>{formatDate(x.donation_date, lang)}</span><span dir="ltr">{Number(x.amount).toLocaleString()}</span>
                  <span style={muted}>{x.purpose ?? ''}</span>
                </div>
              ))}
            </div>
          )}

          {d.meetings && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <h4 style={{ ...sectionTitle, margin: 0, flex: 1 }}>{t('contacts_meetings')}</h4>
                {kind === 'person' && (
                  <Button size="sm" variant="primary" onClick={() => router.push(`/dashboard/meetings?tab=calendar&with=${c.id}&wname=${encodeURIComponent(c.name)}`)}>
                    {t('contacts_book')}
                  </Button>
                )}
              </div>
              {d.meetings.length === 0 ? <div style={muted}>{t('contacts_no_meetings')}</div> : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {d.meetings.map(m => (
                    <Link key={m.id} href={`/dashboard/meetings/${m.id}`} style={{ fontSize: 13, color: 'var(--text)', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)', minWidth: 130 }}>{formatDate(m.starts_at.slice(0, 10), lang)} {isoTime(m.starts_at)}</span>
                      <span style={{ fontWeight: 600 }}>{m.title}</span>
                      {m.status !== 'scheduled' && <span style={muted}>({t(`status_${m.status}`)})</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Новый личный контакт ─────────────────────────────────────────────────────

function AddPrivateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations('meetings_mgr')
  const [f, setF] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  async function save() {
    if (!(f.full_name ?? '').trim()) { toastError(t('contacts_err_name')); return }
    setBusy(true)
    const r = await send('/api/meetings/contacts', 'POST', { contacts: [f] })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('saved'))
    onDone()
  }

  const row = (k: string, text: string, ltr?: boolean) => (
    <div><span style={label}>{text}</span><input style={input} dir={ltr ? 'ltr' : undefined} value={f[k] ?? ''} onChange={set(k)} /></div>
  )
  return (
    <Modal onClose={onClose} title={t('contacts_add')} maxWidth={560}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{t('save')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {row('full_name', t('contacts_name'))}
          {row('phone', t('contacts_phone'), true)}
          {row('email', t('contacts_email'), true)}
          {row('city', t('contacts_city'))}
          {row('organization', t('contacts_organization'))}
          {row('role_title', t('contacts_role'))}
          {row('category', t('contacts_category'))}
        </div>
        <div><span style={label}>{t('contacts_notes')}</span><textarea style={{ ...input, minHeight: 70 }} value={f.notes ?? ''} onChange={set('notes')} /></div>
        <div style={muted}>{t('contacts_add_hint')}</div>
      </div>
    </Modal>
  )
}

// ── Импорт из таблицы (CSV из Google Sheets / Excel) ────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations('meetings_mgr')
  const [parsed, setParsed] = useState<{ rows: PrivateContactInput[]; skipped: number; recognized: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File) {
    const text = await file.text()
    setParsed(contactsFromTable(parseCsv(text)))
  }

  async function run() {
    if (!parsed || parsed.rows.length === 0) return
    setBusy(true)
    const r = await send('/api/meetings/contacts', 'POST', { contacts: parsed.rows.slice(0, MAX_IMPORT_ROWS) })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(fill(t('contacts_import_done'), { n: Number(r.data.created ?? 0) }))
    onDone()
  }

  return (
    <Modal onClose={onClose} title={t('contacts_import')} maxWidth={560}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy || !parsed || parsed.rows.length === 0} onClick={run}>
          {fill(t('contacts_import_run'), { n: parsed?.rows.length ?? 0 })}
        </Button>
      </div>}>
      <div style={{ display: 'grid', gap: 10, fontSize: 13.5 }}>
        <div>{t('contacts_import_hint')}</div>
        <div style={muted}>{t('contacts_import_columns')}</div>
        <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
        {parsed && !parsed.recognized && <div style={{ color: 'var(--danger)' }}>{t('contacts_import_no_name')}</div>}
        {parsed && parsed.recognized && (
          <div>
            {fill(t('contacts_import_ready'), { n: parsed.rows.length })}
            {parsed.skipped > 0 && <> · {fill(t('contacts_import_skipped'), { n: parsed.skipped })}</>}
            {parsed.rows.length > MAX_IMPORT_ROWS && <div style={{ color: 'var(--danger)' }}>{fill(t('contacts_import_too_many'), { n: MAX_IMPORT_ROWS })}</div>}
            <div style={{ ...muted, marginTop: 6 }}>
              {parsed.rows.slice(0, 5).map((r, i) => <div key={i}>{[r.full_name, r.phone, r.email, r.category].filter(Boolean).join(' · ')}</div>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
