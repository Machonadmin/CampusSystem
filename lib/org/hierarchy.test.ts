import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Контракт: «глава» — это is_head, и только он ────────────────────────────
//
// Старшинство «кто выше кого» раньше собиралось из ДВУХ полей: активной позиции
// staff_positions.is_head и колонки departments.head_person_id. Второе поле
// ничего не решало в правах, никто его не синхронизировал с первым, и оно
// удалено миграцией 20260923120000.
//
// Здесь это закреплено поведенчески: в фикстуре подразделений лежит
// head_person_id, указывающий на candidate, — и он НЕ должен давать ему ни
// одного подчинённого. Если кто-то вернёт чтение колонки, упадёт именно этот
// тест, а не производный экран месяцем позже.

type Res = { data?: unknown[]; error?: unknown }

/**
 * Заглушка Supabase. Ответы задаются СПИСКОМ на таблицу и выдаются по порядку
 * вызовов: subjectsBelow обращается к staff_positions дважды с разным смыслом
 * (позиции главы candidate, затем позиции subjects), и один общий ответ на обе
 * сделал бы тест бессмысленным.
 */
function makeClient(source: Record<string, Res[]>) {
  const seen = new Map<string, number>()
  return {
    from(table: string) {
      const list = source[table] ?? []
      const i = seen.get(table) ?? 0
      seen.set(table, i + 1)
      const res = list[i] ?? list[list.length - 1] ?? { data: [] }
      const proxy: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const p = Promise.resolve({ data: res.data ?? null, error: res.error ?? null })
            return p.then.bind(p)
          }
          return () => proxy
        },
      })
      return proxy
    },
  }
}

let rows: Record<string, Res[]> = {}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => makeClient(rows),
}))

import { subjectsBelow } from './hierarchy'

const BOSS = 'boss'
const CLERK = 'clerk'

const DEPTS = [
  { id: 'root', parent_id: null },
  { id: 'college', parent_id: 'root' },
  { id: 'col3', parent_id: 'college' },
  { id: 'kitchen', parent_id: 'root' },
]

/** Подразделения + «мина»: старая колонка назначает boss главой кухни. */
const DEPTS_WITH_LEGACY_HEAD = DEPTS.map(d =>
  d.id === 'kitchen' ? { ...d, head_person_id: BOSS } : { ...d, head_person_id: null },
)

const headPositions = (rowsIn: Array<{ department_id: string; end_date: string | null }>) => ({ data: rowsIn })
const subjectPositions = (rowsIn: Array<{ person_id: string; department_id: string; end_date: string | null }>) => ({ data: rowsIn })

beforeEach(() => { rows = {} })

describe('subjectsBelow', () => {
  it('глава единицы получает её сотрудников', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: null }]),
        subjectPositions([{ person_id: CLERK, department_id: 'college', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([CLERK])
  })

  it('домен разворачивается вниз по дереву', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: null }]),
        subjectPositions([{ person_id: CLERK, department_id: 'col3', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([CLERK])
  })

  it('соседняя ветка не входит в домен', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: null }]),
        subjectPositions([{ person_id: CLERK, department_id: 'kitchen', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([])
  })

  it('закрытая должность главы ничего не открывает', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: '2000-01-01' }]),
        subjectPositions([{ person_id: CLERK, department_id: 'college', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([])
  })

  it('закрытая должность ПОДЧИНЁННОГО не делает его подчинённым', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: null }]),
        subjectPositions([{ person_id: CLERK, department_id: 'college', end_date: '2000-01-01' }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([])
  })

  it('старая колонка head_person_id больше НЕ делает главой', async () => {
    // Единственное, что отличает этот случай от первого: главой boss назначен
    // удалённым полем, а не посадкой. Ответ обязан быть пустым.
    rows = {
      departments: [{ data: DEPTS_WITH_LEGACY_HEAD }],
      staff_positions: [
        headPositions([]),
        subjectPositions([{ person_id: CLERK, department_id: 'kitchen', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([])
  })

  it('сам себя в подчинённые не берёт', async () => {
    rows = {
      departments: [{ data: DEPTS }],
      staff_positions: [
        headPositions([{ department_id: 'college', end_date: null }]),
        subjectPositions([{ person_id: BOSS, department_id: 'college', end_date: null }]),
      ],
    }
    expect([...await subjectsBelow(BOSS, [BOSS])]).toEqual([])
  })

  it('ошибка базы не выдаёт подчинённых по ошибке', async () => {
    rows = { departments: [{ error: { message: 'boom' }, data: undefined }], staff_positions: [] }
    expect([...await subjectsBelow(BOSS, [CLERK])]).toEqual([])
  })
})
