import { describe, it, expect } from 'vitest'
import { isAllowedPushEndpoint, isValidPushKey } from './endpoint'

describe('isAllowedPushEndpoint', () => {
  it('настоящие push-сервисы браузеров → да', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:APA91b')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGuQyavXutnMH')).toBe(true)
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=BQYAAA')).toBe(true)
  })

  it('внутренние и чужие адреса → нет (SSRF)', () => {
    expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedPushEndpoint('https://localhost/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com.example/x')).toBe(false)
  })

  it('http, нестандартный порт, логин в адресе, мусор → нет', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://u:p@fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(3000)}`)).toBe(false)
  })
})

describe('isValidPushKey', () => {
  it('base64url разумной длины → да, остальное → нет', () => {
    expect(isValidPushKey('BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM')).toBe(true)
    expect(isValidPushKey('')).toBe(false)
    expect(isValidPushKey('a b')).toBe(false)
    expect(isValidPushKey('a'.repeat(300))).toBe(false)
    expect(isValidPushKey(null)).toBe(false)
  })
})
