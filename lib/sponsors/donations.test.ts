import { describe, it, expect } from 'vitest'
import {
  donationStats,
  campaignTotals,
  matchesSponsorSearch,
  type DonationStatLike,
  type DonationCampaignLike,
  type SponsorSearchable,
} from './donations'

describe('donationStats', () => {
  it('пустой список → нули и пустой count_by_status', () => {
    expect(donationStats([])).toEqual({
      total_received: 0,
      total_pledged: 0,
      total_cancelled: 0,
      count_by_status: {},
    })
  })

  it('суммирует по статусам и считает count_by_status', () => {
    const donations: DonationStatLike[] = [
      { amount: 100, status: 'received' },
      { amount: 50.5, status: 'received' },
      { amount: 200, status: 'pledged' },
      { amount: 30, status: 'cancelled' },
      { amount: 70, status: 'pledged' },
    ]
    expect(donationStats(donations)).toEqual({
      total_received: 150.5,
      total_pledged: 270,
      total_cancelled: 30,
      count_by_status: { received: 2, pledged: 2, cancelled: 1 },
    })
  })

  it('суммы в копейках — без float-дрейфа (0.1 + 0.2 = 0.3)', () => {
    const donations: DonationStatLike[] = [
      { amount: 0.1, status: 'received' },
      { amount: 0.2, status: 'received' },
    ]
    const stats = donationStats(donations)
    expect(stats.total_received).toBe(0.3)
    // Прямое сложение float дало бы 0.30000000000000004 — проверяем, что нет.
    expect(stats.total_received).not.toBe(0.1 + 0.2)
  })

  it('amount строкой от PostgREST суммируется корректно', () => {
    const donations: DonationStatLike[] = [
      { amount: '100.25', status: 'received' },
      { amount: '99.75', status: 'received' },
      { amount: '10', status: 'pledged' },
    ]
    expect(donationStats(donations)).toEqual({
      total_received: 200,
      total_pledged: 10,
      total_cancelled: 0,
      count_by_status: { received: 2, pledged: 1 },
    })
  })

  it('неизвестные статусы попадают в count_by_status, но не в денежные суммы', () => {
    const donations: DonationStatLike[] = [
      { amount: 500, status: 'refunded' },
      { amount: 100, status: 'received' },
    ]
    const stats = donationStats(donations)
    expect(stats.total_received).toBe(100)
    expect(stats.total_pledged).toBe(0)
    expect(stats.total_cancelled).toBe(0)
    expect(stats.count_by_status).toEqual({ refunded: 1, received: 1 })
  })
})

describe('campaignTotals', () => {
  it('пустой список → {}', () => {
    expect(campaignTotals([])).toEqual({})
  })

  it('по умолчанию суммирует только received по кампаниям', () => {
    const donations: DonationCampaignLike[] = [
      { amount: 100, status: 'received', campaign: 'Зимняя' },
      { amount: 50, status: 'received', campaign: 'Зимняя' },
      { amount: 200, status: 'received', campaign: 'Стипендии' },
      { amount: 999, status: 'pledged', campaign: 'Зимняя' },     // не received — пропущено
      { amount: 999, status: 'cancelled', campaign: 'Стипендии' }, // не received — пропущено
    ]
    expect(campaignTotals(donations)).toEqual({
      'Зимняя': 150,
      'Стипендии': 200,
    })
  })

  it('пожертвования без кампании (null/пустая) пропускаются', () => {
    const donations: DonationCampaignLike[] = [
      { amount: 100, status: 'received', campaign: null },
      { amount: 50, status: 'received', campaign: '   ' },
      { amount: 25, status: 'received', campaign: 'Общий фонд' },
    ]
    expect(campaignTotals(donations)).toEqual({ 'Общий фонд': 25 })
  })

  it('statusFilter можно переопределить (напр. pledged)', () => {
    const donations: DonationCampaignLike[] = [
      { amount: 100, status: 'pledged', campaign: 'Весна' },
      { amount: 40, status: 'pledged', campaign: 'Весна' },
      { amount: 500, status: 'received', campaign: 'Весна' },
    ]
    expect(campaignTotals(donations, 'pledged')).toEqual({ 'Весна': 140 })
  })

  it('суммы в копейках — без float-дрейфа', () => {
    const donations: DonationCampaignLike[] = [
      { amount: 0.1, status: 'received', campaign: 'X' },
      { amount: 0.2, status: 'received', campaign: 'X' },
    ]
    expect(campaignTotals(donations)['X']).toBe(0.3)
  })

  it('amount строкой от PostgREST суммируется корректно', () => {
    const donations: DonationCampaignLike[] = [
      { amount: '75.50', status: 'received', campaign: 'Y' },
      { amount: '24.50', status: 'received', campaign: 'Y' },
    ]
    expect(campaignTotals(donations)['Y']).toBe(100)
  })
})

describe('matchesSponsorSearch', () => {
  function s(over: Partial<SponsorSearchable> = {}): SponsorSearchable {
    return {
      name: 'Фонд Развития',
      email: 'info@fund.org',
      phone: '03-1234567',
      contact_person: 'Мириам Коэн',
      ...over,
    }
  }

  it('пустой или пробельный запрос совпадает со всеми', () => {
    expect(matchesSponsorSearch(s(), '')).toBe(true)
    expect(matchesSponsorSearch(s(), '   ')).toBe(true)
  })

  it('ищет по имени без учёта регистра', () => {
    expect(matchesSponsorSearch(s(), 'фонд')).toBe(true)
    expect(matchesSponsorSearch(s(), 'ФОНД')).toBe(true)
  })

  it('ищет по email, телефону и контактному лицу', () => {
    expect(matchesSponsorSearch(s(), 'fund.org')).toBe(true)
    expect(matchesSponsorSearch(s(), '1234567')).toBe(true)
    expect(matchesSponsorSearch(s(), 'мириам')).toBe(true)
  })

  it('null-поля не ломают поиск и не совпадают', () => {
    const bare = s({ email: null, phone: null, contact_person: null })
    expect(matchesSponsorSearch(bare, 'фонд')).toBe(true)
    expect(matchesSponsorSearch(bare, '1234567')).toBe(false)
  })

  it('false когда подстроки нет ни в одном поле', () => {
    expect(matchesSponsorSearch(s(), 'нет-такого')).toBe(false)
  })

  it('обрезает пробелы вокруг запроса', () => {
    expect(matchesSponsorSearch(s(), '  фонд  ')).toBe(true)
  })
})
