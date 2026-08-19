import { describe, it, expect } from 'vitest'
import { signatureFolder, isValidSignaturePath } from './signature-storage'

// Путь подписи ЖЁСТКО привязан к stage_instance_id — это защита от IDOR:
// иначе клиент мог бы «указать» drawing_path на чужой приватный объект в том же
// бакете. Эти тесты фиксируют контракт валидатора.

const SID   = '11111111-1111-4111-8111-111111111111'
const FILE  = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

describe('signatureFolder', () => {
  it('строит папку signatures/<stageInstanceId>', () => {
    expect(signatureFolder(SID)).toBe(`signatures/${SID}`)
  })
})

describe('isValidSignaturePath', () => {
  it('принимает корректный путь этого этапа', () => {
    expect(isValidSignaturePath(`signatures/${SID}/${FILE}.png`, SID)).toBe(true)
  })

  it('принимает путь в верхнем регистре (case-insensitive)', () => {
    expect(isValidSignaturePath(`SIGNATURES/${SID.toUpperCase()}/${FILE.toUpperCase()}.PNG`, SID)).toBe(true)
  })

  it('ОТВЕРГАЕТ путь, указывающий на папку ДРУГОГО этапа (IDOR)', () => {
    expect(isValidSignaturePath(`signatures/${OTHER}/${FILE}.png`, SID)).toBe(false)
  })

  it('отвергает объект вне префикса signatures/ (чужой документ бакета)', () => {
    expect(isValidSignaturePath(`documents/${SID}/${FILE}.png`, SID)).toBe(false)
  })

  it('отвергает попытку обхода каталога (../)', () => {
    expect(isValidSignaturePath(`signatures/${SID}/../${FILE}.png`, SID)).toBe(false)
    expect(isValidSignaturePath(`signatures/${SID}/../../secret.png`, SID)).toBe(false)
  })

  it('отвергает неверное расширение', () => {
    expect(isValidSignaturePath(`signatures/${SID}/${FILE}.pdf`, SID)).toBe(false)
    expect(isValidSignaturePath(`signatures/${SID}/${FILE}`, SID)).toBe(false)
  })

  it('отвергает имя файла, не являющееся UUID', () => {
    expect(isValidSignaturePath(`signatures/${SID}/not-a-real-uuid-value.png`, SID)).toBe(false)
    expect(isValidSignaturePath(`signatures/${SID}/------------------------------------.png`, SID)).toBe(false)
  })

  it('отвергает, когда сам stageInstanceId не UUID', () => {
    expect(isValidSignaturePath(`signatures/not-a-uuid/${FILE}.png`, 'not-a-uuid')).toBe(false)
  })

  it('отвергает вложенные подпапки', () => {
    expect(isValidSignaturePath(`signatures/${SID}/sub/${FILE}.png`, SID)).toBe(false)
  })
})
