import { describe, it, expect } from 'vitest'
import { parseCsv, detectDelimiter } from './csv-parse'

describe('detectDelimiter', () => {
  it('запятая по умолчанию', () => expect(detectDelimiter('a,b,c')).toBe(','))
  it('точка с запятой', () => expect(detectDelimiter('a;b;c')).toBe(';'))
  it('таб', () => expect(detectDelimiter('a\tb\tc')).toBe('\t'))
  it('не считает разделители внутри кавычек', () => expect(detectDelimiter('"a;b;c",d')).toBe(','))
})

describe('parseCsv', () => {
  it('простая матрица', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('снимает BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b'])
  })
  it('поля в кавычках с запятой и экранированием', () => {
    expect(parseCsv('"a,b","c""d"')).toEqual([['a,b', 'c"d']])
  })
  it('CRLF и пустые строки отбрасываются', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('точка с запятой + перевод строки внутри кавычек', () => {
    expect(parseCsv('a;b\n"x\ny";z')).toEqual([['a', 'b'], ['x\ny', 'z']])
  })
})
