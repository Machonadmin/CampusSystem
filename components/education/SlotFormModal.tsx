'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { localizedName } from '@/lib/i18n/localized-name'
import type { Lang } from '@/lib/i18n/translations'
import { toast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { collidesWithKodesh } from '@/lib/education/kodesh-schedule'

/**
 * ОБЩАЯ форма слота расписания.
 *
 * Раньше жила внутри ScheduleTab и умела работать только с одной, заранее
 * заданной группой. Теперь ею пользуется и кампусная сетка расписания, где
 * группу надо ещё выбрать, — поэтому форма вынесена сюда ЦЕЛИКОМ, а не
 * скопирована: две копии неизбежно разъехались бы в правилах кодеша, наборе
 * тостов и валидации.
 *
 * Отличия режимов ровно два: заблокирована ли группа (lockGroup) и известна ли
 * заранее единица. Всё остальное поведение общее.
 */

// ── Общие мелочи, которыми пользуются обе поверхности ────────────────────────

/** 2024-01-01 — понедельник; стабильный якорь для локализованных имён дней. */
export function weekdayLabel(lang: string, wd: number, format: 'short' | 'long'): string {
  const d = new Date(Date.UTC(2024, 0, wd))
  return d.toLocaleDateString(intlLocale(lang), { weekday: format, timeZone: 'UTC' })
}

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM'. */
export function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

// Кодеш-акцент (золото модуля «еврейство») — для времени в зарезервированном
// утреннем окне. Тинт через rgba работает в обеих темах.
export const KODESH_GOLD = '#ca8a04'
export const KODESH_TINT = 'rgba(202,138,4,0.13)'

// ── Каркас модалки (общий для формы слота и модалки генерации) ───────────────

export function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose} maxWidth={440} closeOnBackdrop panelStyle={{ padding: 24 }}>
      {children}
    </Modal>
  )
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const tCommon = useTranslations('common')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
      <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

export function ModalError({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
      {text}
    </div>
  )
}

export function ModalActions({
  accentColor, saving, onCancel, onSubmit, cancelLabel, saveLabel,
}: { accentColor: string; saving: boolean; onCancel: () => void; onSubmit: () => void; cancelLabel: string; saveLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
      <button
        onClick={onCancel} disabled={saving}
        style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
      >
        {cancelLabel}
      </button>
      <SubmitButton
        onClick={onSubmit} loading={saving}
        style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accentColor, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.55 : 1 }}
      >
        {saveLabel}
      </SubmitButton>
    </div>
  )
}

// ── Типы ─────────────────────────────────────────────────────────────────────

export interface SlotFormSlot {
  id: string
  class_group_id: string
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  subject_id?: string | null
  teacher_id?: string | null
}

interface UnitOpt { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface GroupOpt {
  id: string
  name: string
  department_id: string | null
  subject?: { id: string; name: string; name_he?: string | null } | null
  teachers?: { person_id: string; full_name: string | null }[]
}
interface SubjectOpt { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface TeacherOpt { id: string; full_name: string }

export interface SlotFormModalProps {
  slot: SlotFormSlot | null          // null = создание
  /** Группа, если она задана снаружи (карточка группы). */
  groupId?: string | null
  /** Запретить менять группу (режим карточки группы). */
  lockGroup?: boolean
  presetDay?: number                 // предвыбранный день при создании
  presetUnit?: string                // предвыбранная единица (фильтр сетки)
  accentColor: string
  onClose: () => void
  onDone: () => void
}

export default function SlotFormModal({
  slot, groupId, lockGroup = false, presetDay, presetUnit, accentColor, onClose, onDone,
}: SlotFormModalProps) {
  const t = useTranslations('education.schedule')
  const { lang } = useLang()

  // ── Поля ──
  const [unitId, setUnitId] = useState(presetUnit ?? '')
  const [classGroupId, setClassGroupId] = useState(slot?.class_group_id ?? groupId ?? '')
  const [subjectId, setSubjectId] = useState(slot?.subject_id ?? '')
  const [teacherId, setTeacherId] = useState(slot?.teacher_id ?? '')
  const [dayOfWeek, setDayOfWeek] = useState(slot ? String(slot.day_of_week) : String(presetDay ?? 1))
  const [startTime, setStartTime] = useState(slot ? hhmm(slot.start_time) : '')
  const [endTime, setEndTime] = useState(slot ? hhmm(slot.end_time) : '')
  const [room, setRoom] = useState(slot?.room ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Живое предупреждение: время попадает в зарезервированное окно кодеша.
  // Мягкое правило (как на бэкенде): сообщаем, не блокируем.
  const kodeshClash = !!startTime && !!endTime && endTime > startTime
    && collidesWithKodesh(Number(dayOfWeek), startTime, endTime)

  // ── Справочники ──
  const [units, setUnits] = useState<UnitOpt[]>([])
  const [groups, setGroups] = useState<GroupOpt[]>([])
  const [subjects, setSubjects] = useState<SubjectOpt[]>([])
  const [teachers, setTeachers] = useState<TeacherOpt[]>([])
  const [buildings, setBuildings] = useState<{ id: string; name: string; rooms: { id: string; name: string }[] }[]>([])
  const [buildingId, setBuildingId] = useState('')
  const [roomId, setRoomId] = useState('')

  const pickedGroup = useMemo(() => groups.find(g => g.id === classGroupId) ?? null, [groups, classGroupId])
  // Единица, под которую фильтруем предметы и преподавателей: явно выбранная,
  // иначе — подразделение выбранной группы.
  const effectiveUnit = unitId || pickedGroup?.department_id || ''

  useEffect(() => {
    fetch('/api/education/buildings')
      .then(r => (r.ok ? r.json() : { buildings: [] }))
      .then(b => setBuildings(b.buildings ?? []))
      .catch(() => setBuildings([]))
  }, [])

  // Единицы нужны только когда группу выбирают здесь же.
  useEffect(() => {
    if (lockGroup) return
    fetch('/api/education/units')
      .then(r => (r.ok ? r.json() : { units: [] }))
      .then(b => setUnits(b.units ?? []))
      .catch(() => setUnits([]))
  }, [lockGroup])

  useEffect(() => {
    const qs = unitId ? `?department_id=${encodeURIComponent(unitId)}` : ''
    fetch(`/api/education/class-groups${qs}`)
      .then(r => (r.ok ? r.json() : { class_groups: [] }))
      .then(b => setGroups((b.class_groups ?? []) as GroupOpt[]))
      .catch(() => setGroups([]))
  }, [unitId])

  useEffect(() => {
    const qs = effectiveUnit ? `?department_id=${encodeURIComponent(effectiveUnit)}` : ''
    fetch(`/api/education/subjects${qs}`)
      .then(r => (r.ok ? r.json() : { subjects: [] }))
      .then(b => setSubjects((b.subjects ?? []) as SubjectOpt[]))
      .catch(() => setSubjects([]))
  }, [effectiveUnit])

  // Преподаватели: каталог единицы. Если общего пула нам не отдают (он требует
  // прав управления группами, которых у редактора расписания может не быть, —
  // тогда прилетает 403), откатываемся на преподавателей ВЫБРАННОЙ ГРУППЫ: они
  // уже приехали вместе со списком групп и не требуют отдельного права.
  // Так пикер не бывает пустым.
  useEffect(() => {
    let alive = true
    const fallback = () => {
      if (!alive) return
      setTeachers((pickedGroup?.teachers ?? [])
        .map(x => ({ id: x.person_id, full_name: (x.full_name ?? '').trim() }))
        .filter(x => x.full_name))
    }
    const qs = effectiveUnit ? `?department_id=${encodeURIComponent(effectiveUnit)}` : ''
    fetch(`/api/education/teachers${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        if (!alive) return
        const people = (b?.people ?? []) as TeacherOpt[]
        if (people.length > 0) setTeachers(people)
        else fallback()
      })
      .catch(fallback)
    return () => { alive = false }
  }, [effectiveUnit, pickedGroup])

  // ── «תפוס»: кто уже занят в это окно (по всему кампусу, не только в единице) ──
  const [busy, setBusy] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!startTime || !endTime || endTime <= startTime) { setBusy(new Map()); return }
    let alive = true
    const qs = new URLSearchParams({ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime })
    if (slot?.id) qs.set('exclude_slot_id', slot.id)
    fetch(`/api/education/teachers/availability?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : { busy: [] }))
      .then(b => {
        if (!alive) return
        const rows = (b.busy ?? []) as Array<{ person_id: string; group_name: string }>
        setBusy(new Map(rows.map(r => [r.person_id, r.group_name])))
      })
      .catch(() => { if (alive) setBusy(new Map()) })
    return () => { alive = false }
  }, [dayOfWeek, startTime, endTime, slot?.id])

  // ── Состав выбранной группы (только показать) ──
  const [students, setStudents] = useState<string[] | null>(null)
  const [showStudents, setShowStudents] = useState(false)
  const loadStudents = useCallback(async () => {
    if (!classGroupId) { setStudents(null); return }
    try {
      // /enrollments, а не /class-groups/[id]: его проверка права включает
      // преподавателей группы, поэтому он работает и при scope='own'.
      const r = await fetch(`/api/education/class-groups/${classGroupId}/enrollments`)
      if (!r.ok) { setStudents([]); return }
      const b = await r.json()
      const rows = (b.enrollments ?? []) as Array<{ journey?: { person?: { full_name?: string | null; hebrew_name?: string | null } | null } | null }>
      setStudents(rows
        .map(e => (e.journey?.person?.hebrew_name || e.journey?.person?.full_name || '').trim())
        .filter(Boolean))
    } catch { setStudents([]) }
  }, [classGroupId])
  useEffect(() => { setStudents(null); setShowStudents(false) }, [classGroupId])
  useEffect(() => { if (showStudents && students === null) loadStudents() }, [showStudents, students, loadStudents])

  const pickedBuilding = buildings.find(b => b.id === buildingId)

  // ── Сохранение ──
  const handleSubmit = async () => {
    if (!classGroupId) { setFormError(t('group_required')); return }
    if (!startTime || !endTime) { setFormError(t('time_required')); return }
    if (endTime <= startTime) { setFormError(t('end_after_start')); return }

    setSaving(true)
    setFormError(null)
    try {
      // Отправляем ТОЛЬКО то, что форма действительно задаёт. Раньше PATCH слал
      // все поля сразу, и правка времени молча обнуляла кабинет из реестра.
      const payload: Record<string, unknown> = {
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        room: room.trim() || null,
        subject_id: subjectId || null,
        teacher_id: teacherId || null,
      }
      if (buildingId || roomId) {
        payload.building_id = buildingId || null
        payload.room_id = roomId || null
      }
      const resp = slot
        ? await fetch(`/api/education/schedule/slots/${slot.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch(`/api/education/class-groups/${classGroupId}/schedule/slots`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const respBody = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setFormError(respBody.error ?? t('action_failed'))
        return
      }
      // Кодеш-время: слот ушёл на утверждение מנהל כללי — сообщаем.
      // Иначе — мягкое правило иудаики (время зарезервировано) как раньше.
      if (respBody.pending) toast(t('kodesh_pending_toast'), 'info')
      else if (respBody.warning) toast(respBody.warning, 'info')
      // Перенос кабинета → уведомлены преподаватели/ученицы группы.
      if (respBody.room_move_notified) toast(t('room_moved_notified').replace('{n}', String(respBody.room_move_notified)), 'info')
      // Конфликты кабинет/преподаватель/ученицы — не блокируют, но предупреждаем.
      const conflicts = (respBody.conflicts ?? []) as Array<{ kind: 'room' | 'teacher' | 'students'; group_name: string; detail?: string }>
      for (const c of conflicts) {
        const msg = c.kind === 'room'
          ? t('conflict_room').replace('{room}', c.detail ?? '').replace('{group}', c.group_name)
          : c.kind === 'teacher'
            ? t('conflict_teacher').replace('{group}', c.group_name)
            : t('conflict_students').replace('{n}', c.detail ?? '').replace('{group}', c.group_name)
        toast(msg, 'error')
      }
      onDone()
    } catch {
      setFormError(t('action_failed'))
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none',
  }

  const groupSubjectLabel = pickedGroup?.subject
    ? localizedName({ name: pickedGroup.subject.name, name_he: pickedGroup.subject.name_he ?? null }, lang as Lang)
    : ''

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={slot ? t('modal_edit_title') : t('modal_create_title')} onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {!lockGroup && (
          <>
            <div>
              <label style={labelStyle}>{t('unit_label')}</label>
              <select aria-label={t('unit_label')} value={unitId}
                onChange={e => { setUnitId(e.target.value); setClassGroupId(''); setSubjectId(''); setTeacherId('') }}
                style={inputStyle}
              >
                <option value="">{t('all_units_option')}</option>
                {units.map(u => <option key={u.id} value={u.id}>{localizedName(u, lang as Lang)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('group_label')} *</label>
              <select aria-label={t('group_label')} value={classGroupId}
                onChange={e => { setClassGroupId(e.target.value); setSubjectId(''); setTeacherId('') }}
                style={inputStyle}
              >
                <option value="">{t('group_placeholder')}</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <label style={labelStyle}>{t('subject_label')}</label>
          <select aria-label={t('subject_label')} value={subjectId} onChange={e => setSubjectId(e.target.value)} style={inputStyle}>
            <option value="">
              {groupSubjectLabel
                ? t('subject_inherit_named').replace('{subject}', groupSubjectLabel)
                : t('subject_inherit')}
            </option>
            {subjects.map(s => <option key={s.id} value={s.id}>{localizedName(s, lang as Lang)}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>{t('teacher_label')}</label>
          <select aria-label={t('teacher_label')} value={teacherId} onChange={e => setTeacherId(e.target.value)} style={inputStyle}>
            <option value="">{t('teacher_inherit')}</option>
            {teachers.map(p => (
              <option key={p.id} value={p.id}>
                {busy.has(p.id) ? `${p.full_name} — ${t('teacher_busy')}` : p.full_name}
              </option>
            ))}
          </select>
          {/* Занятость не блокирует сохранение — как и прочие мягкие конфликты;
              жёстко (409) блокируется только занятый кабинет. */}
          {teacherId && busy.has(teacherId) && (
            <div style={{ marginTop: 6, fontSize: 12, color: KODESH_GOLD }}>
              {t('teacher_busy_hint').replace('{group}', busy.get(teacherId) ?? '')}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>{t('day_label')}</label>
          <select aria-label={t('day_label')} value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} style={inputStyle}>
            {[1, 2, 3, 4, 5, 6, 7].map(wd => (
              <option key={wd} value={wd}>{weekdayLabel(lang, wd, 'long')}</option>
            ))}
          </select>
        </div>

        <div className="resp-grid-2" style={{ gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('start_label')} *</label>
            <input aria-label={t('start_label')} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('end_label')} *</label>
            <input aria-label={t('end_label')} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {buildings.length > 0 && (
          <div className="resp-grid-2" style={{ gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('building_label')}</label>
              <select aria-label={t('building_label')}
                value={buildingId}
                onChange={e => { setBuildingId(e.target.value); setRoomId('') }}
                style={inputStyle}
              >
                <option value="">{t('none_option')}</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('room_select_label')}</label>
              <select aria-label={t('room_select_label')}
                value={roomId}
                onChange={e => {
                  const rid = e.target.value
                  setRoomId(rid)
                  const rm = pickedBuilding?.rooms.find(r => r.id === rid)
                  if (rm && pickedBuilding) setRoom(`${pickedBuilding.name} / ${rm.name}`)
                }}
                disabled={!pickedBuilding || pickedBuilding.rooms.length === 0}
                style={inputStyle}
              >
                <option value="">{t('none_option')}</option>
                {(pickedBuilding?.rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>{t('room_label')} {buildings.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>· {t('or_free_text')}</span>}</label>
          <input aria-label={t('room_placeholder')} value={room} onChange={e => setRoom(e.target.value)} placeholder={t('room_placeholder')} style={inputStyle} />
        </div>

        {/* Состав группы — только показать: «урок привязан к группе, а в ней вот
            эти ученицы». Ничего не записывает. */}
        {classGroupId && (
          <div>
            <button type="button" onClick={() => setShowStudents(v => !v)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 500, color: 'var(--accent-strong)', textAlign: 'start',
            }}>
              {showStudents ? '▾' : '▸'} {t('students_toggle')}
              {students !== null && ` (${students.length})`}
            </button>
            {showStudents && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)', maxHeight: 132, overflowY: 'auto' }}>
                {students === null
                  ? t('students_loading')
                  : students.length === 0
                    ? t('students_empty')
                    : students.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      {kodeshClash && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: KODESH_TINT, color: KODESH_GOLD, borderRadius: 8, fontSize: 12.5, fontWeight: 500, border: `1px solid ${KODESH_TINT}` }}>
          {t('kodesh_time_notice')}
        </div>
      )}

      {formError && <ModalError text={formError} />}

      <ModalActions
        accentColor={accentColor}
        saving={saving}
        onCancel={onClose}
        onSubmit={handleSubmit}
        cancelLabel={t('btn_cancel')}
        saveLabel={saving ? t('btn_saving') : t('btn_save')}
      />
    </ModalShell>
  )
}
