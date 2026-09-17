import { describe, it, expect } from 'vitest'
import {
  buildTree, countPrivileges, collectPrivileges, privilegeKey,
  type NodeInput, type ItemInput, type CatalogEntryInput,
} from './tree'

// Главное, что здесь проверяется: НИ ОДНО право не исчезает с экрана. Потерянное
// право администратор не видит — значит, не может ни открыть, ни закрыть его, и
// при этом уверен, что видит всю картину. Это хуже, чем неудобный экран.

const cat = (module: string, code: string, over: Partial<CatalogEntryInput> = {}): CatalogEntryInput => ({
  module, privilege_code: code,
  name_he: `${code}-he`, name_ru: `${code}-ru`, name_en: `${code}-en`,
  description_he: 'מה זה נותן', description_ru: 'что даёт', description_en: 'what it gives',
  level: 'view', risk: 'normal', allowed_scopes: ['all', 'department', 'own'],
  is_legacy: false, superseded_by: null, sort_order: 0,
  ...over,
})

const node = (id: string, parent: string | null, over: Partial<NodeInput> = {}): NodeInput => ({
  id, parent_id: parent, sort_order: 0,
  name_he: `${id}-he`, name_ru: `${id}-ru`, name_en: `${id}-en`,
  description_he: null, description_ru: null, description_en: null,
  module_code: null, icon: null, color: null, department_id: null,
  ...over,
})

const item = (nodeId: string, module: string, code: string, sort = 0): ItemInput =>
  ({ node_id: nodeId, module, privilege_code: code, sort_order: sort })

describe('buildTree — ничего не теряется', () => {
  it('право без узла попадает в «не распределено», а не исчезает', () => {
    const t = buildTree('he', [node('n1', null)], [item('n1', 'studies', 'a')], [
      cat('studies', 'a'), cat('studies', 'b'),
    ])
    expect(t.roots[0].items.map(i => i.code)).toEqual(['a'])
    expect(t.unassigned.map(i => i.code)).toEqual(['b'])
  })

  it('узел с потерянным родителем становится корнем вместе со своим поддеревом', () => {
    // 'ghost' в списке узлов нет — так бывает после удаления родителя.
    const t = buildTree('he',
      [node('orphan', 'ghost'), node('child', 'orphan')],
      [item('child', 'studies', 'a')],
      [cat('studies', 'a')],
    )
    expect(t.roots.map(r => r.id)).toEqual(['orphan'])
    expect(t.roots[0].children.map(c => c.id)).toEqual(['child'])
    expect(t.unassigned).toEqual([])
  })

  it('узел, назначенный родителем самому себе, не зацикливает сборку', () => {
    const t = buildTree('he', [node('self', 'self')], [], [])
    expect(t.roots.map(r => r.id)).toEqual(['self'])
    expect(t.roots[0].children).toEqual([])
  })

  it('пункт на несуществующий узел не роняет сборку — право уходит в «не распределено»', () => {
    const t = buildTree('he', [node('n1', null)], [item('нет-узла', 'studies', 'a')], [cat('studies', 'a')])
    expect(t.roots[0].items).toEqual([])
    expect(t.unassigned.map(i => i.code)).toEqual(['a'])
  })

  it('пункт на право, которого больше нет в каталоге, игнорируется', () => {
    const t = buildTree('he', [node('n1', null)], [item('n1', 'studies', 'исчезло')], [])
    expect(t.roots[0].items).toEqual([])
    expect(t.unassigned).toEqual([])
  })

  it('сумма разложенных и нераспределённых равна каталогу — всегда', () => {
    const catalog = ['a', 'b', 'c', 'd'].map(c => cat('studies', c))
    const t = buildTree('he',
      [node('n1', null), node('n2', 'n1')],
      [item('n1', 'studies', 'a'), item('n2', 'studies', 'b')],
      catalog,
    )
    const inTree = t.roots.flatMap(collectPrivileges).length
    expect(inTree + t.unassigned.length).toBe(catalog.length)
  })
})

describe('buildTree — порядок и вложенность', () => {
  it('корни и дети сортируются по sort_order, затем по имени', () => {
    const t = buildTree('he', [
      node('b', null, { sort_order: 1, name_he: 'ב' }),
      node('a', null, { sort_order: 0, name_he: 'א' }),
      node('c', null, { sort_order: 0, name_he: 'ג' }),
    ], [], [])
    expect(t.roots.map(r => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('дерево вкладывается на несколько уровней', () => {
    const t = buildTree('he', [node('r', null), node('m', 'r'), node('leaf', 'm')], [], [])
    expect(t.roots[0].children[0].children[0].id).toBe('leaf')
  })

  it('права внутри узла идут в своём порядке', () => {
    const t = buildTree('he', [node('n', null)],
      [item('n', 'm', 'z', 2), item('n', 'm', 'a', 1)],
      [cat('m', 'z'), cat('m', 'a')],
    )
    expect(t.roots[0].items.map(i => i.code)).toEqual(['a', 'z'])
  })
})

describe('buildTree — подписи на языке пользователя', () => {
  it('берёт язык пользователя', () => {
    const t = buildTree('ru', [node('n', null)], [item('n', 'm', 'a')], [cat('m', 'a')])
    expect(t.roots[0].name).toBe('n-ru')
    expect(t.roots[0].items[0].name).toBe('a-ru')
  })

  it('без единого перевода подпись = null: экран обязан написать «нет подписи», а не код', () => {
    const t = buildTree('he', [node('n', null)], [item('n', 'm', 'a')], [
      cat('m', 'a', { name_he: null, name_ru: null, name_en: null }),
    ])
    expect(t.roots[0].items[0].name).toBeNull()
  })

  it('отсутствие объяснения видно отдельно от отсутствия подписи', () => {
    const t = buildTree('he', [node('n', null)], [item('n', 'm', 'a')], [
      cat('m', 'a', { description_he: null, description_ru: null, description_en: null }),
    ])
    expect(t.roots[0].items[0].name).toBe('a-he')
    expect(t.roots[0].items[0].description).toBeNull()
  })
})

describe('countPrivileges / collectPrivileges', () => {
  const t = buildTree('he',
    [node('r', null), node('m', 'r'), node('leaf', 'm')],
    [item('r', 'x', 'a'), item('m', 'x', 'b'), item('leaf', 'x', 'c')],
    [cat('x', 'a'), cat('x', 'b'), cat('x', 'c')],
  )

  it('считает права всего поддерева', () => {
    expect(countPrivileges(t.roots[0])).toBe(3)
    expect(countPrivileges(t.roots[0].children[0])).toBe(2)
  })

  it('собирает права поддерева — по ним идёт выдача целым узлом', () => {
    expect(collectPrivileges(t.roots[0]).map(i => i.code).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('privilegeKey', () => {
  it('не склеивает разные права в один ключ', () => {
    expect(privilegeKey('a', 'b_c')).not.toBe(privilegeKey('a_b', 'c'))
  })
})
