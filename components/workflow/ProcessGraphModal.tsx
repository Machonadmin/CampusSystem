'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeStatus = 'completed' | 'active' | 'waiting' | 'skipped' | 'cancelled' | null

interface GraphNode {
  id: string
  code: string
  name_ru: string
  sort_order: number
  activation_rule: 'after_one' | 'after_all'
  status: NodeStatus
  stage_instance_id: string | null
  final_code: string | null
}

interface GraphEdge {
  from_stage_template_id: string
  to_stage_template_id: string
  final_code: string | null
  final_name: string | null
}

interface GraphData {
  process_status: 'active' | 'completed' | 'cancelled'
  process_final: string | null
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface Props {
  processInstanceId: string
  onClose: () => void
  /** Открыть карточку подэтапа. Вызывается только для узлов со stage_instance_id. */
  onStageClick: (stageInstanceId: string) => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Экранирует текст для подписи узла/ребра Mermaid (кавычки внутри "..."). */
function esc(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/\n/g, ' ').trim() || '—'
}

const STATUS_CLASS: Record<NonNullable<NodeStatus>, string> = {
  completed: 'completed',
  active: 'active',
  waiting: 'waiting',
  skipped: 'skipped',
  cancelled: 'skipped',
}

/** Строит Mermaid-разметку графа из данных. */
function buildMermaid(data: GraphData): { markup: string; nodeKeyToInstance: Map<string, string> } {
  const ordered = [...data.nodes].sort((a, b) => a.sort_order - b.sort_order)
  const keyOf = new Map<string, string>()      // stage_template_id → mermaid node key (n0, n1…)
  const nodeKeyToInstance = new Map<string, string>() // mermaid node key → stage_instance_id
  ordered.forEach((n, i) => keyOf.set(n.id, `n${i}`))

  const lines: string[] = ['graph TD']

  // Узлы
  for (const n of ordered) {
    const key = keyOf.get(n.id)!
    lines.push(`  ${key}["${esc(n.name_ru)}"]`)
  }

  // Рёбра
  for (const e of data.edges) {
    const from = keyOf.get(e.from_stage_template_id)
    const to = keyOf.get(e.to_stage_template_id)
    if (!from || !to) continue
    if (e.final_name) {
      lines.push(`  ${from} -->|"${esc(e.final_name)}"| ${to}`)
    } else {
      lines.push(`  ${from} --> ${to}`)
    }
  }

  // Классы статусов
  lines.push('  classDef completed fill:#D1FAE5,stroke:#065F46,color:#065F46;')
  lines.push('  classDef active fill:#DBEAFE,stroke:#2563EB,color:#1E40AF,stroke-width:2px;')
  lines.push('  classDef waiting fill:#F3F4F6,stroke:#D1D5DB,color:#9CA3AF;')
  lines.push('  classDef skipped fill:#F9FAFB,stroke:#E5E7EB,color:#9CA3AF;')
  lines.push('  classDef pending fill:#FFFFFF,stroke:#D1D5DB,color:#6B7280;')

  for (const n of ordered) {
    const key = keyOf.get(n.id)!
    const cls = n.status ? STATUS_CLASS[n.status] : 'pending'
    lines.push(`  class ${key} ${cls};`)
    // Кликабельны только узлы с реальным экземпляром подэтапа
    if (n.stage_instance_id) {
      nodeKeyToInstance.set(key, n.stage_instance_id)
      lines.push(`  click ${key} call processGraphNodeClick() "Открыть подэтап"`)
    }
  }

  return { markup: lines.join('\n'), nodeKeyToInstance }
}

const PROCESS_STATUS_LABEL: Record<string, string> = {
  active: 'Активен', completed: 'Завершён', cancelled: 'Отменён',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProcessGraphModal({ processInstanceId, onClose, onStageClick }: Props) {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [svg, setSvg] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Текущая карта «ключ узла → stage_instance_id» для обработчика клика
  const instanceMapRef = useRef<Map<string, string>>(new Map())
  const onStageClickRef = useRef(onStageClick)
  onStageClickRef.current = onStageClick

  // Загрузка данных графа
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/workflow/processes/${processInstanceId}/graph`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error ?? 'Не удалось загрузить схему')
        }
        return r.json() as Promise<GraphData>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [processInstanceId])

  // Регистрация глобального коллбэка клика по узлу (Mermaid securityLevel: 'loose')
  useEffect(() => {
    const w = window as unknown as { processGraphNodeClick?: (nodeKey: string) => void }
    w.processGraphNodeClick = (nodeKey: string) => {
      const instanceId = instanceMapRef.current.get(nodeKey)
      if (instanceId) onStageClickRef.current(instanceId)
    }
    return () => { delete (window as unknown as { processGraphNodeClick?: unknown }).processGraphNodeClick }
  }, [])

  // Рендер Mermaid при появлении данных
  useEffect(() => {
    if (!data) return
    let cancelled = false
    if (data.nodes.length === 0) { setSvg(''); return }

    const { markup, nodeKeyToInstance } = buildMermaid(data)
    instanceMapRef.current = nodeKeyToInstance

    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })
        const renderId = `proc-graph-${Math.random().toString(36).slice(2)}`
        const { svg: out, bindFunctions } = await mermaid.render(renderId, markup)
        if (cancelled) return
        setSvg(out)
        // bindFunctions навешивает click-обработчики на отрендеренные узлы
        requestAnimationFrame(() => {
          if (containerRef.current && bindFunctions) bindFunctions(containerRef.current)
        })
      } catch (e) {
        if (!cancelled) setError('Ошибка отрисовки схемы: ' + (e as Error).message)
      }
    })()

    return () => { cancelled = true }
  }, [data])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Анимация пульсации активного узла + кликабельность */}
      <style>{`
        @keyframes procGraphPulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.55; }
          100% { opacity: 1; }
        }
        .proc-graph-svg .node.active rect,
        .proc-graph-svg .node.active polygon,
        .proc-graph-svg .node.active circle {
          animation: procGraphPulse 1.6s ease-in-out infinite;
        }
        .proc-graph-svg .node[id] { cursor: default; }
        .proc-graph-svg svg { max-width: 100%; height: auto; }
      `}</style>

      <div style={{ background: '#fff', borderRadius: 12, width: '80vw', height: '80vh', maxWidth: 1100, display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Схема процесса</span>
            {data && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                ...(data.process_status === 'active' ? { background: '#D1FAE5', color: '#065F46' }
                  : data.process_status === 'completed' ? { background: '#E5E7EB', color: '#374151' }
                  : { background: '#FEE2E2', color: '#991B1B' }),
              }}>
                {PROCESS_STATUS_LABEL[data.process_status] ?? data.process_status}
              </span>
            )}
            {data?.process_final && (
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>Итог: {data.process_final}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {loading && (
            <div style={{ color: '#9CA3AF', fontSize: 13, alignSelf: 'center' }}>Загрузка схемы…</div>
          )}
          {!loading && error && (
            <div style={{ color: '#EF4444', fontSize: 13, alignSelf: 'center' }}>{error}</div>
          )}
          {!loading && !error && data && data.nodes.length === 0 && (
            <div style={{ color: '#9CA3AF', fontSize: 13, alignSelf: 'center' }}>Нет данных для схемы процесса</div>
          )}
          {!loading && !error && svg && (
            <div
              ref={containerRef}
              className="proc-graph-svg"
              style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '12px 20px 16px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            Кликните по подэтапу со статусом, чтобы открыть его карточку
          </span>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
