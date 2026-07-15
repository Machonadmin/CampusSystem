import { describe, it, expect } from 'vitest'
import { round1, markedCount, attendancePercent, absencePoints, gradeAveragePercent } from './metrics'

describe('round1', () => {
  it('округляет до одного знака', () => {
    expect(round1(33.333)).toBe(33.3)
    expect(round1(66.666)).toBe(66.7)
    expect(round1(50)).toBe(50)
  })
})

describe('markedCount', () => {
  it('сумма всех статусов (3)', () => {
    expect(markedCount({ present: 2, late: 1, absent: 1 })).toBe(4)
    expect(markedCount({ present: 0, late: 0, absent: 0 })).toBe(0)
  })
})

describe('absencePoints', () => {
  it('веса: absent=1, late=0.5, present=0', () => {
    expect(absencePoints({ present: 3, late: 0, absent: 0 })).toBe(0)
    expect(absencePoints({ present: 0, late: 2, absent: 1 })).toBe(2)   // 1 + 0.5*2
    expect(absencePoints({ present: 1, late: 1, absent: 1 })).toBe(1.5) // 1 + 0.5
  })
})

describe('attendancePercent', () => {
  it('опоздание стоит половину пропуска', () => {
    // marked 3, absencePoints = 1 + 0.5 = 1.5 → (3-1.5)/3 = 50
    expect(attendancePercent({ present: 1, late: 1, absent: 1 })).toBe(50)
  })

  it('только absent → 0%', () => {
    expect(attendancePercent({ present: 0, late: 0, absent: 3 })).toBe(0)
  })

  it('полная посещаемость → 100%', () => {
    expect(attendancePercent({ present: 5, late: 0, absent: 0 })).toBe(100)
  })

  it('только опоздания → 50%', () => {
    // marked 2, points = 1 → (2-1)/2 = 50
    expect(attendancePercent({ present: 0, late: 2, absent: 0 })).toBe(50)
  })

  it('ничего не размечено → null', () => {
    expect(attendancePercent({ present: 0, late: 0, absent: 0 })).toBeNull()
  })

  it('округляет процент', () => {
    // marked 3, points 1 → (3-1)/3 = 66.66 → 67
    expect(attendancePercent({ present: 2, late: 0, absent: 1 })).toBe(67)
  })
})

describe('gradeAveragePercent', () => {
  it('средний процент по нескольким оценкам', () => {
    // 80/100=80%, 40/50=80% → среднее 80
    expect(gradeAveragePercent([
      { score: 80, max_score: 100 },
      { score: 40, max_score: 50 },
    ])).toBe(80)
  })

  it('игнорирует непроставленные (null) оценки', () => {
    expect(gradeAveragePercent([
      { score: 100, max_score: 100 },
      { score: null, max_score: 100 },
    ])).toBe(100)
  })

  it('игнорирует max_score = 0 (защита от деления на ноль)', () => {
    expect(gradeAveragePercent([
      { score: 5, max_score: 0 },
      { score: 50, max_score: 100 },
    ])).toBe(50)
  })

  it('нет засчитываемых оценок → null', () => {
    expect(gradeAveragePercent([])).toBeNull()
    expect(gradeAveragePercent([{ score: null, max_score: 100 }])).toBeNull()
    expect(gradeAveragePercent([{ score: 5, max_score: 0 }])).toBeNull()
  })

  it('округляет среднее до 0.1', () => {
    // 100% и 0% → 50; 100,90,80 = 90
    expect(gradeAveragePercent([
      { score: 100, max_score: 100 },
      { score: 0, max_score: 100 },
    ])).toBe(50)
    // 1/3, 2/3, 3/3 → 33.33+66.66+100 /3 = 66.66 → 66.7
    expect(gradeAveragePercent([
      { score: 1, max_score: 3 },
      { score: 2, max_score: 3 },
      { score: 3, max_score: 3 },
    ])).toBe(66.7)
  })
})
