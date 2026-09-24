import { describe, it, expect } from 'vitest'
import { cleanExternalUrl, cleanAppLink } from './safe-url'

describe('cleanExternalUrl', () => {
  it('http(s) пропускается', () => {
    expect(cleanExternalUrl(' https://drive.example/doc ')).toBe('https://drive.example/doc')
    expect(cleanExternalUrl('http://example.org/a')).toBe('http://example.org/a')
  })

  it('пусто → null', () => {
    expect(cleanExternalUrl('')).toBeNull()
    expect(cleanExternalUrl('   ')).toBeNull()
    expect(cleanExternalUrl(null)).toBeNull()
    expect(cleanExternalUrl(undefined)).toBeNull()
  })

  it('опасные схемы и мусор → undefined', () => {
    expect(cleanExternalUrl('javascript:alert(1)')).toBeUndefined()
    expect(cleanExternalUrl(' JavaScript:alert(1)')).toBeUndefined()
    expect(cleanExternalUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(cleanExternalUrl('not a url')).toBeUndefined()
  })
})

describe('cleanAppLink', () => {
  it('внутренний путь и http(s) пропускаются', () => {
    expect(cleanAppLink('/dashboard/tasks/1')).toBe('/dashboard/tasks/1')
    expect(cleanAppLink('https://meet.example/x')).toBe('https://meet.example/x')
  })

  it('чужой хост через // и javascript: → undefined', () => {
    expect(cleanAppLink('//evil.example')).toBeUndefined()
    expect(cleanAppLink('javascript:alert(1)')).toBeUndefined()
  })

  it('пусто → null', () => {
    expect(cleanAppLink('')).toBeNull()
  })
})
