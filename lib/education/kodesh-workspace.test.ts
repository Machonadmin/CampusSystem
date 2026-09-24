import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn() }))

import { headsOnlyKodeshUnits } from './kodesh-workspace'
import { KODESH_DEPT_ID } from './kodesh-exceptions'

const depts = [
  { id: KODESH_DEPT_ID, parent_id: 'inst' },
  { id: 'kodesh-level-1', parent_id: KODESH_DEPT_ID },
  { id: 'college', parent_id: 'inst' },
  { id: 'inst', parent_id: null },
]

describe('headsOnlyKodeshUnits', () => {
  it('только кодеш (или ничего) → true', () => {
    expect(headsOnlyKodeshUnits([], depts)).toBe(true)
    expect(headsOnlyKodeshUnits([KODESH_DEPT_ID], depts)).toBe(true)
  })
  it('потомок кодеша считается кодешем', () => {
    expect(headsOnlyKodeshUnits(['kodesh-level-1'], depts)).toBe(true)
  })
  it('возглавляет и другую единицу → false', () => {
    expect(headsOnlyKodeshUnits([KODESH_DEPT_ID, 'college'], depts)).toBe(false)
    expect(headsOnlyKodeshUnits(['inst'], depts)).toBe(false)
  })
  it('неизвестная единица и цикл в дереве → false, без зацикливания', () => {
    expect(headsOnlyKodeshUnits(['ghost'], depts)).toBe(false)
    expect(headsOnlyKodeshUnits(['a'], [{ id: 'a', parent_id: 'b' }, { id: 'b', parent_id: 'a' }])).toBe(false)
  })
})
