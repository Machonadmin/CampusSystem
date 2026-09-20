import { describe, it, expect } from 'vitest'
import { buildUnitTree, seatReach, flattenUnits, type DepartmentInput, type SeatInput } from './units'

// Здесь проверяется ГРАНИЦА доступа, а не косметика: посадка на единицу
// открывает её и всё, что ниже. Ошибка в этом расчёте — это либо руководитель,
// который не видит свой поток, либо секретарь, который видит весь институт.
//
// Сценарий владельца целиком:
//   Колледж
//     ├─ Колледж · 4 года (группа А)
//     └─ Колледж · 3 года (группа Б)
// Руководитель сидит на «Колледже» → видит оба потока.
// Секретарь сидит на «3 года» → видит только его.

const dept = (id: string, parent: string | null, name: string, over: Partial<DepartmentInput> = {}): DepartmentInput => ({
  id, parent_id: parent, name, name_he: name, name_en: null,
  head_person_id: null, sort_order: 0, is_educational_institution: false,
  ...over,
})

const seat = (person: string, dep: string, isHead = false, end: string | null = null): SeatInput =>
  ({ person_id: person, department_id: dep, is_head: isHead, end_date: end })

const CAMPUS = [
  dept('root', null, 'מכון חמש'),
  dept('college', 'root', 'מכללה', { is_educational_institution: true }),
  dept('col4', 'college', 'מכללה · 4 שנים'),
  dept('col3', 'college', 'מכללה · 3 שנים'),
  dept('school', 'root', 'בית ספר', { is_educational_institution: true }),
  dept('touro', 'root', 'טורו', { is_educational_institution: true }),
]

const TODAY = '2026-09-17'

describe('сценарий владельца: колледж с двумя потоками', () => {
  it('руководитель колледжа достаёт оба потока', () => {
    const reach = seatReach('he', CAMPUS, ['college'])
    expect(reach.ids.sort()).toEqual(['col3', 'col4', 'college'])
  })

  it('секретарь 3-летнего потока достаёт ТОЛЬКО его', () => {
    const reach = seatReach('he', CAMPUS, ['col3'])
    expect(reach.ids).toEqual(['col3'])
    expect(reach.ids).not.toContain('col4')
    expect(reach.ids).not.toContain('college')
  })

  it('посадка на поток НЕ открывает соседний поток и не поднимается вверх', () => {
    const reach = seatReach('he', CAMPUS, ['col4'])
    expect(reach.ids).toEqual(['col4'])
  })

  it('посадка на корень кампуса открывает весь институт', () => {
    const reach = seatReach('he', CAMPUS, ['root'])
    expect(reach.ids.length).toBe(CAMPUS.length)
  })

  it('две посадки складываются', () => {
    const reach = seatReach('he', CAMPUS, ['col3', 'touro'])
    expect(reach.ids.sort()).toEqual(['col3', 'touro'])
  })

  it('подписи возвращаются на языке пользователя, а не идентификаторами', () => {
    const reach = seatReach('he', CAMPUS, ['college'])
    expect(reach.names).toContain('מכללה')
    expect(reach.names).toContain('מכללה · 3 שנים')
    expect(reach.names.every(n => !n.startsWith('col'))).toBe(true)
  })

  it('без посадки не достаёт ничего', () => {
    expect(seatReach('he', CAMPUS, []).ids).toEqual([])
  })
})

describe('buildUnitTree', () => {
  const seats = [
    seat('director', 'college', true),
    seat('secretary', 'col3'),
    seat('teacher-a', 'col4'),
    seat('teacher-b', 'col4'),
    seat('former', 'col4', false, '2026-01-01'),   // должность закрыта
  ]

  it('считает посаженных на саму единицу и на всё поддерево', () => {
    const roots = buildUnitTree('he', CAMPUS, seats, TODAY)
    const college = roots[0].children.find(c => c.id === 'college')!
    expect(college.seatCount).toBe(1)        // сам руководитель
    expect(college.seatCountDeep).toBe(4)    // + секретарь + два преподавателя
  })

  it('закрытая должность не считается', () => {
    const roots = buildUnitTree('he', CAMPUS, seats, TODAY)
    const college = roots[0].children.find(c => c.id === 'college')!
    const col4 = college.children.find(c => c.id === 'col4')!
    expect(col4.seatCount).toBe(2)           // «former» не в счёт
  })

  it('должность, закрытая будущей датой, ещё действует', () => {
    const roots = buildUnitTree('he', CAMPUS, [seat('x', 'col3', false, '2027-01-01')], TODAY)
    const col3 = roots[0].children.find(c => c.id === 'college')!.children.find(c => c.id === 'col3')!
    expect(col3.seatCount).toBe(1)
  })

  it('единица с потерянным родителем становится корнем, а не исчезает', () => {
    const roots = buildUnitTree('he', [dept('lost', 'нет-такого', 'יחידה יתומה')], [], TODAY)
    expect(roots.map(r => r.id)).toEqual(['lost'])
  })

  it('единица, назначенная родителем самой себе, не зацикливает сборку', () => {
    const roots = buildUnitTree('he', [dept('self', 'self', 'עצמי')], [], TODAY)
    expect(roots.map(r => r.id)).toEqual(['self'])
  })

  it('глава единицы виден отдельно от посадки', () => {
    const roots = buildUnitTree('he', [
      dept('root', null, 'מכון'),
      dept('u', 'root', 'יחידה', { head_person_id: 'director' }),
    ], [], TODAY)
    expect(roots[0].children[0].headPersonId).toBe('director')
  })
})

describe('flattenUnits', () => {
  it('отдаёт плоский список с глубиной — для выпадающего списка', () => {
    const flat = flattenUnits(buildUnitTree('he', CAMPUS, [], TODAY))
    const college = flat.find(f => f.label === 'מכללה')!
    const col3 = flat.find(f => f.label === 'מכללה · 3 שנים')!
    expect(college.depth).toBe(1)
    expect(col3.depth).toBe(2)
    expect(flat.length).toBe(CAMPUS.length)
  })
})

// ─── Кто именно посажен ──────────────────────────────────────────────────────
//
// Дерево знало только «сколько». Владелец попросил обратное направление
// работы: «стою на единице и добавляю ей людей» — для этого ему нужно видеть
// имена, а экрану нужны id. Счётчик и список обязаны сходиться: разойдясь, они
// покажут «1 человек» над пустой строкой.

/** flattenUnits отдаёт подписи для выпадающего списка, а не узлы. */
const findUnit = (roots: ReturnType<typeof buildUnitTree>, id: string) => {
  const stack = [...roots]
  while (stack.length) {
    const n = stack.pop()!
    if (n.id === id) return n
    stack.push(...n.children)
  }
  throw new Error(`единица ${id} не найдена`)
}

const walkUnits = (roots: ReturnType<typeof buildUnitTree>) => {
  const out: ReturnType<typeof findUnit>[] = []
  const go = (nodes: typeof roots) => { for (const n of nodes) { out.push(n); go(n.children) } }
  go(roots)
  return out
}

describe('состав единицы', () => {
  it('в seats попадают только действующие посадки', () => {
    const tree = buildUnitTree('he', CAMPUS, [
      seat('p1', 'col3'),
      seat('p2', 'col3', false, '2020-01-01'),   // должность закончилась
      seat('p3', 'col3', false, '2030-01-01'),   // ещё действует
    ], TODAY)

    const col3 = findUnit(tree, 'col3')
    expect(col3.seats.map(s => s.personId).sort()).toEqual(['p1', 'p3'])
  })

  it('признак главы сохраняется', () => {
    const tree = buildUnitTree('he', CAMPUS, [seat('p1', 'col3', true), seat('p2', 'col3')], TODAY)
    const col3 = findUnit(tree, 'col3')
    expect(col3.seats).toEqual([
      { personId: 'p1', isHead: true },
      { personId: 'p2', isHead: false },
    ])
  })

  it('две должности одного человека в одной единице дают ОДНУ строку, и глава побеждает', () => {
    // Иначе в списке человек двоился бы, а снятие одной строки выглядело бы
    // как «убрал, но он остался».
    const tree = buildUnitTree('he', CAMPUS, [seat('p1', 'col3'), seat('p1', 'col3', true)], TODAY)
    const col3 = findUnit(tree, 'col3')
    expect(col3.seats).toEqual([{ personId: 'p1', isHead: true }])
  })

  it('человек в двух единицах виден в обеих', () => {
    const tree = buildUnitTree('he', CAMPUS, [seat('p1', 'col3'), seat('p1', 'school')], TODAY)
    expect(findUnit(tree, 'col3').seats).toEqual([{ personId: 'p1', isHead: false }])
    expect(findUnit(tree, 'school').seats).toEqual([{ personId: 'p1', isHead: false }])
  })

  it('seatCount всегда равен длине seats', () => {
    const tree = buildUnitTree('he', CAMPUS, [
      seat('p1', 'col3'), seat('p1', 'col3', true), seat('p2', 'col3'),
      seat('p3', 'college'), seat('p4', 'school', false, '2020-01-01'),
    ], TODAY)
    for (const u of walkUnits(tree)) {
      expect(u.seatCount, `${u.id}: счётчик разошёлся со списком`).toBe(u.seats.length)
    }
  })
})
