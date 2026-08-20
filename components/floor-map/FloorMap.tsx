'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLang } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translations'
import type { FloorPlan, Room } from './types'

interface Props {
  plan: FloorPlan
  /** Идентификатор выделенного помещения. */
  selectedId?: string | null
  onRoomClick?: (room: Room) => void
  /** Показывать номер БТИ, если название ещё не привязано. */
  showBtiNumbers?: boolean
  /** Подсветить помещения, у которых площадь расходится с планом БТИ. */
  highlightIssues?: boolean
  className?: string
  style?: CSSProperties
}

const COLORS = {
  wall: '#9AA5B4',
  room: '#F4F7FB',
  roomHover: '#CDDCF0',
  roomSelected: '#93B4E8',
  roomIssue: '#FDEACA',
  roomUnnamed: '#E6EAEF',
  stroke: '#6B7787',
  text: '#1F2937',
  textDim: '#6B7280',
}

/** Название на языке интерфейса; если его нет — русское, затем номер БТИ. */
function roomLabel(room: Room, lang: Lang): string | null {
  return room.name[lang] ?? room.name.ru ?? room.bti_number
}

function pathOf(points: [number, number][]): string {
  return 'M ' + points.map(([x, y]) => `${x} ${y}`).join(' L ') + ' Z'
}

export default function FloorMap({
  plan,
  selectedId = null,
  onRoomClick,
  showBtiNumbers = true,
  highlightIssues = true,
  className,
  style,
}: Props) {
  const { lang, isRTL } = useLang()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [width, height] = plan.extent_m

  // Полигоны в JSON уже в метрах и упрощены; компонент ничего не пересчитывает,
  // поэтому те же данные пойдут в будущую 3D-версию без изменений.
  const paths = useMemo(
    () => plan.rooms.map(room => ({ room, d: pathOf(room.polygon_m) })),
    [plan.rooms],
  )

  const fillOf = (room: Room): string => {
    if (room.id === selectedId) return COLORS.roomSelected
    if (room.id === hoveredId) return COLORS.roomHover
    if (!room.bti_number && !room.name.ru) return COLORS.roomUnnamed
    if (highlightIssues && room.issues.includes('area_mismatch')) return COLORS.roomIssue
    return COLORS.room
  }

  return (
    <svg
      className={className}
      style={{ width: '100%', height: 'auto', display: 'block', ...style }}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`План этажа ${plan.floor}`}
    >
      {/* Стены — подложка: промежутки между помещениями и есть их тела. */}
      <path d={pathOf(plan.footprint_polygon_m)} fill={COLORS.wall} />

      {paths.map(({ room, d }) => {
        const clickable = Boolean(onRoomClick)
        return (
          <path
            key={room.id}
            d={d}
            fill={fillOf(room)}
            stroke={COLORS.stroke}
            strokeWidth={0.04}
            strokeLinejoin="round"
            style={{ cursor: clickable ? 'pointer' : 'default', transition: 'fill 0.12s ease' }}
            data-room-id={room.id}
            data-bti-number={room.bti_number ?? ''}
            onMouseEnter={() => setHoveredId(room.id)}
            onMouseLeave={() => setHoveredId(current => (current === room.id ? null : current))}
            onClick={() => onRoomClick?.(room)}
          >
            <title>
              {[roomLabel(room, lang), `${room.area_computed_m2} м²`]
                .filter(Boolean)
                .join(' · ')}
            </title>
          </path>
        )
      })}

      {plan.rooms.map(room => {
        const label = roomLabel(room, lang)
        if (!label || (!showBtiNumbers && !room.name[lang] && !room.name.ru)) return null
        const [cx, cy] = room.centroid_m
        return (
          <text
            key={`label-${room.id}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            direction={isRTL ? 'rtl' : 'ltr'}
            style={{
              font: '600 0.5px sans-serif',
              fill: COLORS.text,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}
