'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FeaturePerms } from '@/lib/permissions'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionType = 'scale_1_5' | 'number' | 'text_short' | 'text_long' | 'yes_no_partial'

interface TQuestion {
  id: string
  text: string
  type: QuestionType
  required: boolean
  order: number
  maps_to?: string
}

interface TBlock {
  id: string
  title: string
  order: number
  type?: string
  questions: TQuestion[]
}

interface TStructure { blocks: TBlock[] }

interface TemplateListItem {
  id: string
  name: string
  description: string | null
  created_at: string
  is_active: boolean
  block_count: number
  question_count: number
}

interface TemplateDetail {
  id: string
  name: string
  description: string | null
  structure: TStructure
  created_at: string
}

// ── Builder working state ─────────────────────────────────────────────────────

interface BQuestion extends TQuestion { _key: string }
interface BBlock extends TBlock { questions: BQuestion[]; _expanded: boolean; _key: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<QuestionType, string> = {
  scale_1_5: 'Шкала 1–5',
  number: 'Число',
  text_short: 'Текст (кратко)',
  text_long: 'Текст (подробно)',
  yes_no_partial: 'Да / Нет / Частично',
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  admin_info: 'Адм. информация',
  summary: 'Итоговый блок',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return `_${Math.random().toString(36).slice(2, 9)}` }

function toBuilderBlocks(blocks: TBlock[]): BBlock[] {
  return blocks.map(b => ({
    ...b,
    _key: b.id,
    _expanded: false,
    questions: b.questions.map(q => ({ ...q, _key: q.id })),
  }))
}

function normalizeStructure(blocks: BBlock[]): TStructure {
  let qCounter = 1
  return {
    blocks: blocks.map((b, bi) => {
      const blockId = b.id.startsWith('_') ? `block_${bi + 1}` : b.id
      return {
        id: blockId,
        title: b.title,
        order: bi + 1,
        ...(b.type ? { type: b.type } : {}),
        questions: b.questions.map(q => {
          const id = `q${qCounter++}`
          return {
            id,
            text: q.text,
            type: q.type,
            required: q.required,
            order: 0,
            ...(q.maps_to ? { maps_to: q.maps_to } : {}),
          }
        }).map((q, qi) => ({ ...q, order: qi + 1 })),
      }
    }),
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── View modal ────────────────────────────────────────────────────────────────

function ViewModal({ tmpl, onClose }: { tmpl: TemplateDetail; onClose: () => void }) {
  const blocks = tmpl.structure?.blocks ?? []
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() { setExpanded(new Set(blocks.map(b => b.id))) }
  function collapseAll() { setExpanded(new Set()) }

  const allExpanded = blocks.length > 0 && expanded.size === blocks.length

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header (fixed) */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#1F2937', margin: 0 }}>{tmpl.name}</p>
            {tmpl.description && <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 0' }}>{tmpl.description}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 24, lineHeight: 1, padding: 0, marginLeft: 12 }}>×</button>
        </div>

        {/* Toolbar (fixed) */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#FAFAFA' }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>
            {blocks.length} {blocks.length === 1 ? 'блок' : 'блоков'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={expandAll}
              disabled={allExpanded}
              style={{ padding: '5px 12px', fontSize: 11, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: allExpanded ? 'not-allowed' : 'pointer', color: '#374151', opacity: allExpanded ? 0.5 : 1 }}
            >
              Развернуть все
            </button>
            <button
              onClick={collapseAll}
              disabled={expanded.size === 0}
              style={{ padding: '5px 12px', fontSize: 11, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: expanded.size === 0 ? 'not-allowed' : 'pointer', color: '#374151', opacity: expanded.size === 0 ? 0.5 : 1 }}
            >
              Свернуть все
            </button>
          </div>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {blocks.map(block => {
            const isOpen = expanded.has(block.id)
            return (
              <div key={block.id} style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  onClick={() => toggle(block.id)}
                  style={{ padding: '10px 14px', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{block.title}</span>
                  {block.type && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', fontWeight: 500 }}>
                      {BLOCK_TYPE_LABELS[block.type] ?? block.type}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>{block.questions.length} вопр.</span>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

                {isOpen && block.questions.length > 0 && (
                  <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {block.questions.map((q, qi) => (
                      <div
                        key={q.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0',
                          borderBottom: qi < block.questions.length - 1 ? '1px solid #F3F4F6' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, marginTop: 1, minWidth: 28 }}>{q.id}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                            {q.text}
                            {q.required && <span style={{ color: '#DC2626', marginLeft: 4 }}>*</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: '#F3F4F6', color: '#6B7280', whiteSpace: 'nowrap' }}>
                              {TYPE_LABELS[q.type]}
                            </span>
                            {q.maps_to && (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: '#FEF3C7', color: '#92400E', whiteSpace: 'nowrap' }}>
                                → {q.maps_to}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && block.questions.length === 0 && (
                  <p style={{ margin: 0, padding: '10px 14px', fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>Нет вопросов</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer (fixed) */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #F3F4F6', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template builder ──────────────────────────────────────────────────────────

function TemplateBuilder({
  initial, onClose, onSaved,
}: {
  initial: TemplateDetail | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = Boolean(initial?.id)
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [blocks, setBlocks] = useState<BBlock[]>(() =>
    initial ? toBuilderBlocks(initial.structure?.blocks ?? []) : []
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function addBlock() {
    setBlocks(prev => [...prev, {
      id: uid(), _key: uid(), title: 'Новый блок', order: prev.length + 1,
      _expanded: true, questions: [],
    }])
  }

  function removeBlock(key: string) {
    setBlocks(prev => prev.filter(b => b._key !== key))
  }

  function updateBlock(key: string, patch: Partial<BBlock>) {
    setBlocks(prev => prev.map(b => b._key === key ? { ...b, ...patch } : b))
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks(prev => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function addQuestion(blockKey: string) {
    setBlocks(prev => prev.map(b => {
      if (b._key !== blockKey) return b
      const newQ: BQuestion = {
        id: uid(), _key: uid(),
        text: '', type: 'scale_1_5', required: true, order: b.questions.length + 1,
      }
      return { ...b, questions: [...b.questions, newQ] }
    }))
  }

  function removeQuestion(blockKey: string, qKey: string) {
    setBlocks(prev => prev.map(b => {
      if (b._key !== blockKey) return b
      return { ...b, questions: b.questions.filter(q => q._key !== qKey) }
    }))
  }

  function updateQuestion(blockKey: string, qKey: string, patch: Partial<BQuestion>) {
    setBlocks(prev => prev.map(b => {
      if (b._key !== blockKey) return b
      return { ...b, questions: b.questions.map(q => q._key === qKey ? { ...q, ...patch } : q) }
    }))
  }

  function moveQuestion(blockKey: string, idx: number, dir: -1 | 1) {
    setBlocks(prev => prev.map(b => {
      if (b._key !== blockKey) return b
      const qs = [...b.questions]
      const swap = idx + dir
      if (swap < 0 || swap >= qs.length) return b;
      [qs[idx], qs[swap]] = [qs[swap], qs[idx]]
      return { ...b, questions: qs }
    }))
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Введите название шаблона'); return }
    setSaving(true); setErr('')
    const structure = normalizeStructure(blocks)
    const body = { name: name.trim(), description: description.trim() || null, structure }
    const url = isEdit ? `/api/settings/quality-templates/${initial!.id}` : '/api/settings/quality-templates'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (res.ok) { onSaved() }
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка сохранения') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 860, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#1F2937', margin: 0 }}>
            {isEdit ? 'Редактировать шаблон' : 'Создать шаблон'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 2 }}>
              <label style={lbl}>Название шаблона *</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Проверка урока..." />
            </div>
            <div style={{ flex: 3 }}>
              <label style={lbl}>Описание</label>
              <input value={description} onChange={e => setDescription(e.target.value)} style={inp} placeholder="Краткое описание назначения шаблона" />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontWeight: 600, fontSize: 14, color: '#1F2937', margin: 0 }}>Блоки ({blocks.length})</p>
              <button onClick={addBlock}
                style={{ padding: '6px 14px', fontSize: 12, borderRadius: 7, border: 'none', background: '#3B82F6', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                + Добавить блок
              </button>
            </div>

            {blocks.length === 0 && (
              <div style={{ border: '2px dashed #E5E7EB', borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Нет блоков. Добавьте первый блок.</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blocks.map((block, bi) => (
                <div key={block._key} style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>

                  <div style={{ padding: '10px 12px', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                      <button onClick={() => moveBlock(bi, -1)} disabled={bi === 0}
                        style={{ width: 18, height: 14, border: '1px solid #D1D5DB', borderRadius: 3, background: '#fff', cursor: bi === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: bi === 0 ? 0.35 : 1, padding: 0 }}>
                        <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 4L4 1L7 4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                      <button onClick={() => moveBlock(bi, 1)} disabled={bi === blocks.length - 1}
                        style={{ width: 18, height: 14, border: '1px solid #D1D5DB', borderRadius: 3, background: '#fff', cursor: bi === blocks.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: bi === blocks.length - 1 ? 0.35 : 1, padding: 0 }}>
                        <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>

                    <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, width: 16 }}>{bi + 1}.</span>

                    <input value={block.title} onChange={e => updateBlock(block._key, { title: e.target.value })}
                      style={{ flex: 1, padding: '4px 8px', fontSize: 13, fontWeight: 500, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', minWidth: 0 }} />

                    {block.type && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#DBEAFE', color: '#1D4ED8', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {BLOCK_TYPE_LABELS[block.type] ?? block.type}
                      </span>
                    )}

                    <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{block.questions.length} вопр.</span>

                    <button onClick={() => updateBlock(block._key, { _expanded: !block._expanded })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '2px 4px', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        style={{ transform: block._expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>

                    <button onClick={() => removeBlock(block._key)}
                      style={{ background: '#FEF2F2', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#DC2626', padding: '3px 7px', fontSize: 11, flexShrink: 0 }}>
                      Удалить
                    </button>
                  </div>

                  {block._expanded && (
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {block.questions.length === 0 && (
                        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 4px', textAlign: 'center' }}>
                          Нет вопросов. Добавьте первый вопрос в этот блок.
                        </p>
                      )}

                      {block.questions.map((q, qi) => (
                        <div key={q._key} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 10px', background: '#FAFAFA', borderRadius: 7, border: '1px solid #E5E7EB' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0, marginTop: 2 }}>
                            <button onClick={() => moveQuestion(block._key, qi, -1)} disabled={qi === 0}
                              style={{ width: 16, height: 12, border: '1px solid #D1D5DB', borderRadius: 2, background: '#fff', cursor: qi === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: qi === 0 ? 0.35 : 1, padding: 0 }}>
                              <svg width="7" height="4" viewBox="0 0 7 4" fill="none"><path d="M0.5 3.5L3.5 0.5L6.5 3.5" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            </button>
                            <button onClick={() => moveQuestion(block._key, qi, 1)} disabled={qi === block.questions.length - 1}
                              style={{ width: 16, height: 12, border: '1px solid #D1D5DB', borderRadius: 2, background: '#fff', cursor: qi === block.questions.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: qi === block.questions.length - 1 ? 0.35 : 1, padding: 0 }}>
                              <svg width="7" height="4" viewBox="0 0 7 4" fill="none"><path d="M0.5 0.5L3.5 3.5L6.5 0.5" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            </button>
                          </div>

                          <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, width: 14, marginTop: 6 }}>{qi + 1}.</span>

                          <input value={q.text} onChange={e => updateQuestion(block._key, q._key, { text: e.target.value })}
                            placeholder="Текст вопроса..." style={{ flex: 1, padding: '5px 8px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none' }} />

                          <select value={q.type} onChange={e => updateQuestion(block._key, q._key, { type: e.target.value as QuestionType })}
                            style={{ padding: '5px 6px', fontSize: 11, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', flexShrink: 0 }}>
                            {(Object.entries(TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#374151', flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap', paddingTop: 4 }}>
                            <input type="checkbox" checked={q.required} onChange={e => updateQuestion(block._key, q._key, { required: e.target.checked })}
                              style={{ accentColor: '#3B82F6', width: 13, height: 13 }} />
                            Обяз.
                          </label>

                          {q.maps_to && (
                            <span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              → {q.maps_to}
                            </span>
                          )}

                          <button onClick={() => removeQuestion(block._key, q._key)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px 2px', flexShrink: 0 }}
                            title="Удалить вопрос">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ))}

                      <button onClick={() => addQuestion(block._key)}
                        style={{ alignSelf: 'flex-start', padding: '5px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', marginTop: 2 }}>
                        + Добавить вопрос
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 24px', borderTop: '1px solid #F3F4F6', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {err ? <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{err}</p> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>
              Отмена
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '8px 22px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Сохранение...' : (isEdit ? 'Сохранить изменения' : 'Создать шаблон')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type BuilderState =
  | null
  | { mode: 'create' }
  | { mode: 'edit' | 'view'; template: TemplateDetail }

interface Props {
  perms: FeaturePerms
}

export default function TemplatesTab({ perms }: Props) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [builderState, setBuilderState] = useState<BuilderState>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/settings/quality-templates')
      if (res.ok) {
        setTemplates(await res.json())
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Ошибка ${res.status}`)
      }
    } catch {
      setError('Нет соединения с сервером')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function openEdit(id: string, mode: 'edit' | 'view') {
    setLoadingDetail(true)
    const res = await fetch(`/api/settings/quality-templates/${id}`)
    setLoadingDetail(false)
    if (!res.ok) { alert('Не удалось загрузить шаблон'); return }
    const template: TemplateDetail = await res.json()
    setBuilderState({ mode, template })
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Удалить шаблон «${name}»?\n\nЭто действие нельзя отменить.`)) return
    const res = await fetch(`/api/settings/quality-templates/${id}`, { method: 'DELETE' })
    if (res.ok) { load() }
    else { const d = await res.json(); alert(d.error ?? 'Ошибка удаления') }
  }

  const btnSm: React.CSSProperties = { padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '16px' }}>
      {perms.can_create && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={() => setBuilderState({ mode: 'create' })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#EC4899', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать шаблон
          </button>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Загрузка...</div>
        ) : error ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : templates.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
            Нет шаблонов. Создайте первый шаблон проверки.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                {['НАЗВАНИЕ', 'ОПИСАНИЕ', 'БЛОКОВ', 'ВОПРОСОВ', 'СОЗДАН', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #F9FAFB' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{t.name}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#6B7280', maxWidth: 260 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151', textAlign: 'center' }}>{t.block_count}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151', textAlign: 'center' }}>{t.question_count}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(t.id, 'view')} disabled={loadingDetail}
                        style={{ ...btnSm, border: '1px solid #D1D5DB', background: '#fff', color: '#374151' }}>
                        Просмотр
                      </button>
                      {perms.can_edit && (
                        <button onClick={() => openEdit(t.id, 'edit')} disabled={loadingDetail}
                          style={{ ...btnSm, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8' }}>
                          Редактировать
                        </button>
                      )}
                      {perms.can_delete && (
                        <button onClick={() => handleDelete(t.id, t.name)}
                          style={{ ...btnSm, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#DC2626' }}>
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {builderState?.mode === 'create' && (
        <TemplateBuilder
          initial={null}
          onClose={() => setBuilderState(null)}
          onSaved={() => { setBuilderState(null); load() }}
        />
      )}
      {builderState?.mode === 'edit' && (
        <TemplateBuilder
          initial={builderState.template}
          onClose={() => setBuilderState(null)}
          onSaved={() => { setBuilderState(null); load() }}
        />
      )}
      {builderState?.mode === 'view' && (
        <ViewModal
          tmpl={builderState.template}
          onClose={() => setBuilderState(null)}
        />
      )}
    </div>
  )
}
