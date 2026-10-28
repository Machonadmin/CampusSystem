import { describe, it, expect } from 'vitest'
import { titleFromFileName, exceedsRequestLimit, REQUEST_UPLOAD_LIMIT_BYTES } from './client-upload'

describe('titleFromFileName', () => {
  it('drops the extension', () => {
    expect(titleFromFileName('תעודת לידה.pdf')).toBe('תעודת לידה')
    expect(titleFromFileName('passport.scan.JPG')).toBe('passport.scan')
  })
  it('drops a path', () => {
    expect(titleFromFileName('C:\\Users\\me\\Docs\\id.png')).toBe('id')
    expect(titleFromFileName('/home/me/id.png')).toBe('id')
  })
  it('keeps a name without an extension or made only of one', () => {
    expect(titleFromFileName('scan')).toBe('scan')
    expect(titleFromFileName('.pdf')).toBe('.pdf')
  })
})

describe('exceedsRequestLimit', () => {
  it('allows files up to the limit', () => {
    expect(exceedsRequestLimit({ size: 1_000_000 })).toBe(false)
    expect(exceedsRequestLimit({ size: REQUEST_UPLOAD_LIMIT_BYTES })).toBe(false)
  })
  it('rejects files the hosting would cut off (5.2 MB got 413 on the live site)', () => {
    expect(exceedsRequestLimit({ size: REQUEST_UPLOAD_LIMIT_BYTES + 1 })).toBe(true)
    expect(exceedsRequestLimit({ size: 5_200_000 })).toBe(true)
  })
})
