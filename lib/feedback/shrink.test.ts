import { describe, it, expect } from 'vitest'
import { shrinkSize, shrunkName, shrinkScreenshot, SHRINK_MAX_SIDE } from './shrink'

describe('feedback: сжатие скриншотов', () => {
  it('экран телефона уменьшается пропорционально до длинной стороны', () => {
    expect(shrinkSize(1080, 2400)).toEqual({ width: 864, height: SHRINK_MAX_SIDE })
    expect(shrinkSize(2560, 1440)).toEqual({ width: SHRINK_MAX_SIDE, height: 1080 })
  })

  it('маленькая картинка не увеличивается', () => {
    expect(shrinkSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(shrinkSize(0, 0)).toEqual({ width: 1, height: 1 })
  })

  it('имя файла получает .jpg', () => {
    expect(shrunkName('Screenshot 1.png')).toBe('Screenshot 1.jpg')
    expect(shrunkName('photo.final.webp')).toBe('photo.final.jpg')
    expect(shrunkName('noext')).toBe('noext.jpg')
    expect(shrunkName('')).toBe('screenshot.jpg')
  })

  it('без браузера (сервер, тесты) уходит оригинал', async () => {
    const f = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    expect(await shrinkScreenshot(f)).toBe(f)
  })
})
