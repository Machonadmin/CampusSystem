import { describe, it, expect } from 'vitest'
import { validateSignature } from './signature'
import { isValidSignaturePath, isValidFinanceSignaturePath, financeSignatureFolder } from './signature-storage'

const STAGE = '11111111-2222-4333-8444-555555555555'
const IMG = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const okPath = `signatures/${STAGE}/${IMG}.png`

describe('isValidSignaturePath', () => {
  it('accepts a well-formed path bound to the stage', () => {
    expect(isValidSignaturePath(okPath, STAGE)).toBe(true)
  })
  it('rejects a path for a different stage (IDOR guard)', () => {
    const other = '99999999-2222-4333-8444-555555555555'
    expect(isValidSignaturePath(`signatures/${other}/${IMG}.png`, STAGE)).toBe(false)
  })
  it('rejects an arbitrary document path in the shared bucket', () => {
    expect(isValidSignaturePath(`journeys/${STAGE}/x-passport.png`, STAGE)).toBe(false)
  })
  it('rejects traversal / non-png', () => {
    expect(isValidSignaturePath(`signatures/${STAGE}/../secret.png`, STAGE)).toBe(false)
    expect(isValidSignaturePath(`signatures/${STAGE}/${IMG}.pdf`, STAGE)).toBe(false)
  })
  it('rejects a finance signature path (different scope)', () => {
    expect(isValidSignaturePath(`${financeSignatureFolder(STAGE)}/${IMG}.png`, STAGE)).toBe(false)
  })
})

describe('isValidFinanceSignaturePath', () => {
  const JOURNEY = STAGE
  it('accepts a path bound to the student (journey)', () => {
    expect(isValidFinanceSignaturePath(`signatures/finance/${JOURNEY}/${IMG}.png`, JOURNEY)).toBe(true)
  })
  it('rejects another student\'s folder (IDOR guard)', () => {
    const other = '99999999-2222-4333-8444-555555555555'
    expect(isValidFinanceSignaturePath(`signatures/finance/${other}/${IMG}.png`, JOURNEY)).toBe(false)
  })
  it('rejects a stage signature path and arbitrary documents', () => {
    expect(isValidFinanceSignaturePath(`signatures/${JOURNEY}/${IMG}.png`, JOURNEY)).toBe(false)
    expect(isValidFinanceSignaturePath(`journeys/${JOURNEY}/${IMG}.png`, JOURNEY)).toBe(false)
    expect(isValidFinanceSignaturePath(`signatures/finance/${JOURNEY}/../${IMG}.png`, JOURNEY)).toBe(false)
  })
})

describe('validateSignature (drawn only, owner decision M19)', () => {
  const base = { stageInstanceId: STAGE }

  it('requires a signature payload', () => {
    expect(validateSignature(null, base)).toEqual({ error: 'signature_required' })
  })
  it('rejects an unknown kind', () => {
    expect(validateSignature({ kind: 'wax-seal' }, base)).toEqual({ error: 'invalid_signature_kind' })
  })
  it('rejects a typed signature: signing is drawing only', () => {
    expect(validateSignature({ kind: 'typed', typed_name: 'Sarah Cohen' } as never, base)).toEqual({ error: 'signature_kind_not_allowed' })
  })
  it('requires a drawing path', () => {
    expect(validateSignature({ kind: 'drawn' }, base)).toEqual({ error: 'drawing_required' })
  })
  it('accepts a drawn signature with a valid, stage-bound path', () => {
    const r = validateSignature({ kind: 'drawn', drawing_path: okPath }, base)
    expect(r).toEqual({ ok: { kind: 'drawn', drawing_path: okPath, metadata: {} } })
  })
  it('rejects a drawn signature pointing at another object (IDOR guard)', () => {
    expect(validateSignature({ kind: 'drawn', drawing_path: `journeys/x/passport.png` }, base)).toEqual({ error: 'invalid_drawing_path' })
  })
})
