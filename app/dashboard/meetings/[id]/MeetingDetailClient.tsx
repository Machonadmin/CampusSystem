'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { PersonSelect } from '@/components/ui/person-select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { MeetingVisibility } from '@/lib/meetings/rules'
import {
  PEOPLE_SOURCE, card, label, input, muted, sectionTitle, send, isoDate, isoTime, PeoplePicker, type PersonRef,
} from '../meetings-ui'

interface Detail {
  meeting: {
    id: string; provider_id: string; title: string; reason: string | null; notes: string | null
    summary: string | null; private_note: string | null; prep_notes: string | null
    starts_at: string; ends_at: string; status: string
  }
  owner_name: string
  visibility: MeetingVisibility
  attendees: Array<{ person_id: string; name: string; status: string; journey_id: string | null }>
  student: { journey_id: string; person_id: string; name: string } | null
  items: Array<{ id: string; kind: 'decision' | 'task'; text: string; assignee_name: string | null; due_date: string | null; task_id: string | null; task_status: string | null }>
  viewers: PersonRef[]
  shares: Array<{ id: string; recipient_name: string; content: string; created_at: string; read_at: string | null }>
  documents: Array<{ id: string; file_name: string; size_bytes: number | null; created_at: string }>
}

const STATUS_TONE: Record<string, BadgeTone> = { scheduled: 'info', completed: 'success', cancelled: 'neutral', no_show: 'warn' }

export default function MeetingDetailClient({ id }: { id: string }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [d, setD] = useState<Detail | null>(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/meetings/${id}`, { cache: 'no-store' })
    if (!r.ok) { setMissing(true); return }
    setD(await r.json())
  }, [id])
  useEffect(() => { load() }, [load])

  async function patch(body: Record<string, unknown>, okText?: string): Promise<boolean> {
    const r = await send(`/api/meetings/${id}`, 'PATCH', body)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return false }
    if (okText) toastSuccess(okText)
    await load()
    return true
  }

  const back = <Link href="/dashboard/meetings" style={{ fontSize: 13 }}>‹ {t('back_to_meetings')}</Link>
  if (missing) return <div className="p-4 md:p-6" style={{ display: 'grid', gap: 12 }}>{back}<p>{t('meeting_missing')}</p></div>
  if (!d) return <div className="p-4 md:p-6"><Skeleton height={200} /></div>

  const m = d.meeting
  const v = d.visibility

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
      {back}
      <ModuleHeader module="meetings" title={m.title}
        subtitle={`${formatDate(isoDate(m.starts_at), lang)} · ${isoTime(m.starts_at)}–${isoTime(m.ends_at)} · ${t('calendar_of')} ${d.owner_name}`} />

      {/* ── Кто участвует и ссылки на תיק ───────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ ...sectionTitle, margin: 0, flex: 1 }}>{t('participants')}</h3>
          <Badge dot tone={STATUS_TONE[m.status] ?? 'neutral'} label={t(`status_${m.status}`)} />
        </div>
        {d.student && (
          <div style={{ fontSize: 13.5, marginBottom: 6 }}>
            {d.student.name} · <Link href={`/dashboard/education/students/${d.student.journey_id}`}>{t('open_student_file')}</Link>
          </div>
        )}
        {d.attendees.length === 0 && !d.student ? <div style={muted}>{t('no_attendees')}</div> : d.attendees.map(a => (
          <div key={a.person_id} style={{ fontSize: 13.5, marginBottom: 4 }}>
            {a.name} <span style={muted}>({t(`att_${a.status}`)})</span> ·{' '}
            {a.journey_id
              ? <Link href={`/dashboard/education/students/${a.journey_id}`}>{t('open_student_file')}</Link>
              : <Link href={`/dashboard/persons/${a.person_id}`}>{t('open_person_file')}</Link>}
          </div>
        ))}
        {!v.content && <p style={{ ...muted, margin: '10px 0 0' }}>{t('content_hidden')}</p>}
      </div>

      {v.manageSchedule && <ScheduleCard d={d} onPatch={patch} />}
      {v.prep && <PrepCard d={d} onPatch={patch} onReload={load} />}
      {v.content && <ContentCard d={d} onPatch={patch} onReload={load} />}
      {v.privateNote && <PrivateCard d={d} onPatch={patch} />}
      {v.manageContent && <PrivacyCard d={d} onReload={load} />}
    </div>
  )
}

type PatchFn = (body: Record<string, unknown>, okText?: string) => Promise<boolean>

function ScheduleCard({ d, onPatch }: { d: Detail; onPatch: PatchFn }) {
  const t = useTranslations('meetings_mgr')
  const m = d.meeting
  const [date, setDate] = useState(isoDate(m.starts_at))
  const [start, setStart] = useState(isoTime(m.starts_at))
  const [end, setEnd] = useState(isoTime(m.ends_at))
  const changed = date !== isoDate(m.starts_at) || start !== isoTime(m.starts_at) || end !== isoTime(m.ends_at)
  return (
    <div style={card}>
      <h3 style={sectionTitle}>{t('schedule')}</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><span style={label}>{t('date')}</span><input type="date" style={input} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><span style={label}>{t('from')}</span><input type="time" style={input} value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><span style={label}>{t('to')}</span><input type="time" style={input} value={end} onChange={e => setEnd(e.target.value)} /></div>
        <Button disabled={!changed} onClick={() => onPatch({ starts_at: `${date}T${start}`, ends_at: `${date}T${end}` }, t('saved'))}>{t('reschedule')}</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {m.status !== 'completed' && <Button size="sm" variant="primary" onClick={() => onPatch({ status: 'completed' }, t('saved'))}>{t('mark_completed')}</Button>}
        {m.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={async () => {
          if (await confirmDialog({ message: t('cancel_meeting_confirm'), tone: 'danger' })) await onPatch({ status: 'cancelled' }, t('saved'))
        }}>{t('cancel_meeting')}</Button>}
        {m.status !== 'scheduled' && <Button size="sm" onClick={() => onPatch({ status: 'scheduled' }, t('saved'))}>{t('back_to_scheduled')}</Button>}
      </div>
    </div>
  )
}

function PrepCard({ d, onPatch, onReload }: { d: Detail; onPatch: PatchFn; onReload: () => Promise<void> }) {
  const t = useTranslations('meetings_mgr')
  const [prep, setPrep] = useState(d.meeting.prep_notes ?? '')
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) { toastError(t('file_too_big')); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/meetings/${d.meeting.id}/documents`, { method: 'POST', body: fd })
    setUploading(false)
    if (!r.ok) { const b = await r.json().catch(() => ({})); toastError(String(b.error ?? t('action_failed'))); return }
    await onReload()
  }

  async function open(docId: string) {
    const r = await fetch(`/api/meetings/documents/${docId}`)
    if (!r.ok) { toastError(t('action_failed')); return }
    const b = await r.json()
    window.open(b.url, '_blank', 'noopener')
  }

  async function remove(docId: string) {
    if (!(await confirmDialog({ message: t('delete_doc_confirm'), tone: 'danger' }))) return
    const r = await send(`/api/meetings/documents/${docId}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    await onReload()
  }

  return (
    <div style={card}>
      <h3 style={sectionTitle}>{t('prep_title')}</h3>
      <textarea style={{ ...input, minHeight: 80 }} value={prep} onChange={e => setPrep(e.target.value)} placeholder={t('prep_notes_hint')} />
      <div style={{ marginTop: 8 }}>
        <Button size="sm" disabled={prep === (d.meeting.prep_notes ?? '')} onClick={() => onPatch({ prep_notes: prep }, t('saved'))}>{t('save')}</Button>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={label}>{t('documents')}</span>
        {d.documents.length === 0 ? <div style={muted}>{t('no_documents')}</div> : d.documents.map(doc => (
          <div key={doc.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 4 }}>
            <button type="button" onClick={() => open(doc.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-strong, var(--accent))', cursor: 'pointer', padding: 0, textAlign: 'start' }}>{doc.file_name}</button>
            <Button size="sm" variant="ghost" onClick={() => remove(doc.id)}>{t('remove')}</Button>
          </div>
        ))}
        <label style={{ display: 'inline-block', marginTop: 8 }}>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" style={{ display: 'none' }} disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
          <span style={{ ...input, display: 'inline-block', width: 'auto', cursor: 'pointer', fontWeight: 600 }}>{uploading ? t('uploading') : t('attach_document')}</span>
        </label>
        <div style={{ ...muted, marginTop: 4 }}>{t('upload_hint')}</div>
      </div>
    </div>
  )
}

function ContentCard({ d, onPatch, onReload }: { d: Detail; onPatch: PatchFn; onReload: () => Promise<void> }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const edit = d.visibility.manageContent
  const m = d.meeting
  const [reason, setReason] = useState(m.reason ?? '')
  const [summary, setSummary] = useState(m.summary ?? '')
  const [kind, setKind] = useState<'task' | 'decision'>('task')
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  async function addItem() {
    if (!text.trim()) { toastError(t('err_item_text')); return }
    setBusy(true)
    const r = await send(`/api/meetings/${m.id}/items`, 'POST', { kind, text, assignee_id: assignee, due_date: due || null })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(r.data.task_failed ? t('item_added_task_failed') : assignee ? t('item_added_task') : t('item_added'))
    setText(''); setAssignee(null); setDue('')
    await onReload()
  }

  async function removeItem(itemId: string) {
    if (!(await confirmDialog({ message: t('delete_item_confirm'), tone: 'danger' }))) return
    const r = await send(`/api/meetings/items/${itemId}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    await onReload()
  }

  return (
    <div style={card}>
      <h3 style={sectionTitle}>{t('summary_title')}</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <span style={label}>{t('reason')}</span>
          {edit ? <textarea style={{ ...input, minHeight: 50 }} value={reason} onChange={e => setReason(e.target.value)} />
            : <p style={{ fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' }}>{m.reason || '—'}</p>}
        </div>
        <div>
          <span style={label}>{t('summary')}</span>
          {edit ? <textarea style={{ ...input, minHeight: 110 }} value={summary} onChange={e => setSummary(e.target.value)} placeholder={t('summary_hint')} />
            : <p style={{ fontSize: 13.5, margin: 0, whiteSpace: 'pre-wrap' }}>{m.summary || '—'}</p>}
        </div>
        {edit && (
          <div><Button size="sm" variant="primary" disabled={reason === (m.reason ?? '') && summary === (m.summary ?? '')}
            onClick={() => onPatch({ reason, summary }, t('saved'))}>{t('save_summary')}</Button></div>
        )}

        <div>
          <span style={label}>{t('items_title')}</span>
          {d.items.length === 0 ? <div style={muted}>{t('no_items')}</div> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {d.items.map(it => (
                <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
                  <Badge tone={it.kind === 'decision' ? 'info' : 'neutral'} label={t(`kind_${it.kind}`)} />
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13.5 }}>{it.text}</span>
                  {it.assignee_name && <span style={muted}>{it.assignee_name}</span>}
                  {it.due_date && <span style={muted}>{formatDate(it.due_date, lang)}</span>}
                  {it.task_id && <Link href={`/dashboard/tasks/${it.task_id}`} style={{ fontSize: 12.5 }}>{t(`task_status_${it.task_status ?? 'deleted'}`)}</Link>}
                  {edit && <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)}>{t('remove')}</Button>}
                </div>
              ))}
            </div>
          )}
        </div>

        {edit && (
          <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ ...input, width: 'auto' }} value={kind} onChange={e => setKind(e.target.value as 'task' | 'decision')}>
                <option value="task">{t('kind_task')}</option>
                <option value="decision">{t('kind_decision')}</option>
              </select>
              <input style={{ ...input, flex: 1, minWidth: 200 }} value={text} onChange={e => setText(e.target.value)} placeholder={t('item_text')} maxLength={500} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8 }}>
              <PersonSelect value={assignee} allowAdd={false} source={PEOPLE_SOURCE} placeholder={t('assignee')} onChange={id => setAssignee(id)} />
              <input type="date" style={input} value={due} onChange={e => setDue(e.target.value)} aria-label={t('due_date')} />
            </div>
            <div style={muted}>{t('item_task_hint')}</div>
            <div><Button size="sm" variant="primary" disabled={busy} onClick={addItem}>{t('add_item')}</Button></div>
          </div>
        )}
      </div>
    </div>
  )
}

function PrivateCard({ d, onPatch }: { d: Detail; onPatch: PatchFn }) {
  const t = useTranslations('meetings_mgr')
  const [note, setNote] = useState(d.meeting.private_note ?? '')
  return (
    <div style={{ ...card, borderColor: 'var(--warn)' }}>
      <h3 style={sectionTitle}>🔒 {t('private_note')}</h3>
      <p style={{ ...muted, margin: '0 0 8px' }}>{t('private_note_hint')}</p>
      <textarea style={{ ...input, minHeight: 80 }} value={note} onChange={e => setNote(e.target.value)} />
      <div style={{ marginTop: 8 }}>
        <Button size="sm" disabled={note === (d.meeting.private_note ?? '')} onClick={() => onPatch({ private_note: note }, t('saved'))}>{t('save')}</Button>
      </div>
    </div>
  )
}

function PrivacyCard({ d, onReload }: { d: Detail; onReload: () => Promise<void> }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [viewers, setViewers] = useState<PersonRef[]>(d.viewers)
  const [recipient, setRecipient] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const changed = JSON.stringify(viewers.map(v => v.id).sort()) !== JSON.stringify(d.viewers.map(v => v.id).sort())

  async function saveViewers() {
    const r = await send(`/api/meetings/${d.meeting.id}/viewers`, 'PUT', { person_ids: viewers.map(v => v.id) })
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('saved'))
    await onReload()
  }

  async function share() {
    if (!recipient || !content.trim()) { toastError(t('err_share')); return }
    const r = await send(`/api/meetings/${d.meeting.id}/shares`, 'POST', { recipient_id: recipient, content })
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('shared_ok'))
    setRecipient(null); setContent('')
    await onReload()
  }

  return (
    <div style={card}>
      <h3 style={sectionTitle}>{t('privacy_title')}</h3>
      <p style={{ ...muted, margin: '0 0 8px' }}>{t('privacy_hint')}</p>
      <PeoplePicker value={viewers} onChange={setViewers} placeholder={t('add_viewer')} />
      <div style={{ marginTop: 8 }}><Button size="sm" disabled={!changed} onClick={saveViewers}>{t('save')}</Button></div>

      <h3 style={{ ...sectionTitle, marginTop: 18 }}>{t('share_title')}</h3>
      <p style={{ ...muted, margin: '0 0 8px' }}>{t('share_hint')}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <PersonSelect value={recipient} allowAdd={false} source={PEOPLE_SOURCE} placeholder={t('share_to')} onChange={id => setRecipient(id)} />
        <textarea style={{ ...input, minHeight: 70 }} value={content} onChange={e => setContent(e.target.value)} placeholder={t('share_content')} />
        <div><Button size="sm" variant="primary" onClick={share}>{t('share')}</Button></div>
      </div>
      {d.shares.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {d.shares.map(s => (
            <div key={s.id} style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
              <div style={muted}>{s.recipient_name} · {formatDate(isoDate(s.created_at), lang)} · {s.read_at ? t('share_read') : t('share_unread')}</div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{s.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
