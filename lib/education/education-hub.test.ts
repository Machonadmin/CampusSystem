import { describe, it, expect } from 'vitest'
import { resolveEducationHubTarget, EDUCATION_SECTION_ROUTES } from './education-hub'

describe('resolveEducationHubTarget', () => {
  it('0 sections → fail-closed redirect home', () => {
    expect(resolveEducationHubTarget({ recruitment: false, admission: false, studies: false }))
      .toEqual({ kind: 'redirect', href: '/dashboard' })
  })

  it('exactly 1 section → forward straight to it (skip the hub)', () => {
    expect(resolveEducationHubTarget({ recruitment: false, admission: false, studies: true }))
      .toEqual({ kind: 'redirect', href: EDUCATION_SECTION_ROUTES.studies })
    expect(resolveEducationHubTarget({ recruitment: true, admission: false, studies: false }))
      .toEqual({ kind: 'redirect', href: EDUCATION_SECTION_ROUTES.recruitment })
    expect(resolveEducationHubTarget({ recruitment: false, admission: true, studies: false }))
      .toEqual({ kind: 'redirect', href: EDUCATION_SECTION_ROUTES.admission })
  })

  it('2 sections → hub with those sections in stable order', () => {
    expect(resolveEducationHubTarget({ recruitment: false, admission: true, studies: true }))
      .toEqual({ kind: 'hub', sections: ['admission', 'studies'] })
  })

  it('studies user who also has admission → hub, NOT a jump to admission', () => {
    const target = resolveEducationHubTarget({ recruitment: false, admission: true, studies: true })
    expect(target.kind).toBe('hub')
  })

  it('all 3 (e.g. superadmin) → hub with all three, stable order', () => {
    expect(resolveEducationHubTarget({ recruitment: true, admission: true, studies: true }))
      .toEqual({ kind: 'hub', sections: ['recruitment', 'admission', 'studies'] })
  })
})
