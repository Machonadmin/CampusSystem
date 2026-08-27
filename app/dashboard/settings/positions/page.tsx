'use client'

import { PositionsPanel } from './PositionsPanel'

// «רשימת תפקידים» как самостоятельный маршрут (deep-link). Основной вход —
// вкладка «תפקידים» в объединённом хабе «צוות». Логика — в PositionsPanel.
export default function PositionsPage() {
  return <PositionsPanel />
}
