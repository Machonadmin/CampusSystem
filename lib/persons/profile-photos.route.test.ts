import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Проводка: GET /api/persons/photos ───────────────────────────────────────
//
// Главное обещание владельцу: фото в кружке видит только тот, у кого есть
// persons.view_photos. Проверяем, что без права маршрут даже не читает фото
// (loadProfilePhotoUrls не вызывается), а с правом — отдаёт их.

const m = vi.hoisted(() => ({
  requireView: vi.fn(),
  hasPriv: vi.fn(),
  load: vi.fn(),
}))
vi.mock('@/lib/persons/permissions', () => ({
  requirePersonsPrivilege: m.requireView,
  hasPersonsPrivilege: m.hasPriv,
}))
vi.mock('@/lib/persons/profile-photos-storage', () => ({ loadProfilePhotoUrls: m.load }))

import { GET } from '@/app/api/persons/photos/route'

const A = '11111111-1111-4111-8111-111111111111'
const req = (qs: string) => new NextRequest(`http://localhost/api/persons/photos${qs}`)

beforeEach(() => {
  m.requireView.mockReset().mockResolvedValue({ person_id: 'me', roles: [], principal: 'staff' })
  m.hasPriv.mockReset()
  m.load.mockReset().mockResolvedValue({ [A]: 'https://signed/a.jpg' })
})

describe('GET /api/persons/photos', () => {
  it('без права view_photos — enabled:false, фото не читаются вовсе', async () => {
    m.hasPriv.mockResolvedValue(false)
    const res = await GET(req(`?ids=${A}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false, photos: {} })
    expect(m.hasPriv).toHaveBeenCalledWith(expect.anything(), 'view_photos')
    expect(m.load).not.toHaveBeenCalled()
  })

  it('с правом — фото по разобранному списку людей', async () => {
    m.hasPriv.mockResolvedValue(true)
    const res = await GET(req(`?ids=${A},junk`))
    expect(await res.json()).toEqual({ enabled: true, photos: { [A]: 'https://signed/a.jpg' } })
    expect(m.load).toHaveBeenCalledWith([A])
  })

  it('нет доступа к самому экрану людей — 403, фото не читаются', async () => {
    m.requireView.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
    const res = await GET(req(`?ids=${A}`))
    expect(res.status).toBe(403)
    expect(m.load).not.toHaveBeenCalled()
  })
})
