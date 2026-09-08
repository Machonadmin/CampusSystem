import { describe, it, expect } from 'vitest'
import {
  OPEN_TASK_STATUSES, CLOSED_TASK_STATUSES, isOpenTaskStatus, simplifyTaskStatus,
} from './status'
import type { TaskStatus } from '@/types/database'

// Единая модель статусов задач: пользователь видит open / done / cancelled,
// в БД остаются все 7 исторических значений. Этот файл — единственный источник,
// поэтому расхождение здесь тихо ломает счётчики в 6 местах.
const ALL: TaskStatus[] = [
  'unassigned', 'pending', 'in_progress', 'review', 'declined', 'completed', 'cancelled',
]

describe('модель статусов задач', () => {
  it('открытые и закрытые статусы разбивают ВСЕ значения без пересечений', () => {
    const open = new Set<string>(OPEN_TASK_STATUSES)
    const closed = new Set<string>(CLOSED_TASK_STATUSES)
    for (const s of ALL) {
      expect(open.has(s) !== closed.has(s), `${s} должен быть ровно в одном списке`).toBe(true)
    }
    expect(open.size + closed.size).toBe(ALL.length)
  })

  it('isOpenTaskStatus: легаси review/declined считаются открытыми', () => {
    for (const s of ['unassigned', 'pending', 'in_progress', 'review', 'declined']) {
      expect(isOpenTaskStatus(s), s).toBe(true)
    }
    expect(isOpenTaskStatus('completed')).toBe(false)
    expect(isOpenTaskStatus('cancelled')).toBe(false)
  })

  it('isOpenTaskStatus: неизвестная строка — НЕ открыта (fail-closed)', () => {
    for (const s of ['', 'done', 'COMPLETED', 'Pending', 'archived']) {
      expect(isOpenTaskStatus(s), s).toBe(false)
    }
  })

  it('simplifyTaskStatus: три состояния для UI', () => {
    expect(simplifyTaskStatus('completed')).toBe('done')
    expect(simplifyTaskStatus('cancelled')).toBe('cancelled')
    for (const s of ['unassigned', 'pending', 'in_progress', 'review', 'declined'] as TaskStatus[]) {
      expect(simplifyTaskStatus(s), s).toBe('open')
    }
  })

  it('simplifyTaskStatus и isOpenTaskStatus согласованы', () => {
    for (const s of ALL) {
      expect(simplifyTaskStatus(s) === 'open').toBe(isOpenTaskStatus(s))
    }
  })
})
