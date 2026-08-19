import { describe, it, expect } from 'vitest'
import { validateSignature } from './signature'
import { isValidSignaturePath } from './signature-storage'

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
})

describe('validateSignature', () => {
  const base = { method: 'both' as const, signerFullName: 'Sarah Cohen', stageInstanceId: STAGE }

  it('requires a signature payload', () => {
    expect(validateSignature(null, base)).toEqual({ error: 'signature_required' })
  })
  it('rejects an unknown kind', () => {
    expect(validateSignature({ kind: 'wax-seal' }, base)).toEqual({ error: 'invalid_signature_kind' })
  })

  it('accepts a typed signature that matches the signer name (case-insensitive)', () => {
    const r = validateSignature({ kind: 'typed', typed_name: 'sarah cohen' }, base)
    expect(r).toEqual({ ok: { kind: 'typed', typed_name: 'sarah cohen', drawing_path: null, metadata: {} } })
  })
  it('rejects a typed signature that does not match the signer (forgery guard)', () => {
    expect(validateSignature({ kind: 'typed', typed_name: 'David Levi' }, base)).toEqual({ error: 'typed_name_mismatch' })
  })
  it('rejects an empty typed name', () => {
    expect(validateSignature({ kind: 'typed', typed_name: '   ' }, base)).toEqual({ error: 'typed_name_required' })
  })

  it('accepts a drawn signature with a valid, stage-bound path', () => {
    const r = validateSignature({ kind: 'drawn', drawing_path: okPath }, base)
    expect(r).toEqual({ ok: { kind: 'drawn', typed_name: null, drawing_path: okPath, metadata: {} } })
  })
  it('rejects a drawn signature pointing at another object (IDOR guard)', () => {
    expect(validateSignature({ kind: 'drawn', drawing_path: `journeys/x/passport.png` }, base)).toEqual({ error: 'invalid_drawing_path' })
  })

  it('enforces the org method: typed-only rejects a drawn signature', () => {
    expect(validateSignature({ kind: 'drawn', drawing_path: okPath }, { ...base, method: 'typed' })).toEqual({ error: 'signature_kind_not_allowed' })
  })
  it('enforces the org method: drawn-only rejects a typed signature', () => {
    expect(validateSignature({ kind: 'typed', typed_name: 'Sarah Cohen' }, { ...base, method: 'drawn' })).toEqual({ error: 'signature_kind_not_allowed' })
  })
})
