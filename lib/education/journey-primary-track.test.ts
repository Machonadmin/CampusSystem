import { describe, it, expect } from 'vitest'
import { setPrimaryStudyTrack, buildPrimaryTrackPayload, normalizeTrackNotes } from './journey-primary-track'

// Заглушка Supabase: записывает цепочку вызовов и отдаёт ответ, выбранный
// сценарием по ИМЕНИ операции: 'select-track' (проверка study_tracks),
// 'delete' (снятие других primary), 'upsert' (новая схема), 'upsert-legacy'.
type Call = { method: string; args: unknown[] }
type Op = 'select-track' | 'delete' | 'upsert' | 'upsert-legacy'
type Scenario = (op: Op) => { data?: unknown; error: unknown }

function makeClient(scenario: Scenario) {
  const chains: Array<{ table: string; calls: Call[] }> = []
  function chain(table: string): unknown {
    const rec = { table, calls: [] as Call[] }
    chains.push(rec)
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const up = rec.calls.find(c => c.method === 'upsert')
          const op: Op = table === 'study_tracks' ? 'select-track'
            : up ? ((up.args[1] as { onConflict?: string } | undefined)?.onConflict === 'journey_id' ? 'upsert-legacy' : 'upsert')
            : 'delete'
          const r = scenario(op)
          const p = Promise.resolve({ data: r.data ?? null, error: r.error })
          return p.then.bind(p)
        }
        return (...args: unknown[]) => { rec.calls.push({ method: prop, args }); return proxy }
      },
    })
    return proxy
  }
  return { client: { from: (t: string) => chain(t) }, chains }
}

const input = { journeyId: 'j1', trackId: 't2', updatedBy: 'u1', notes: '  hello  ' }
const trackFound = { data: { id: 't2' }, error: null }
const ok = { error: null }
const err = (code: string) => ({ error: { code, message: code } })
/** Обычный сценарий: маршрут существует, всё остальное — как задано. */
const withTrack = (rest: (op: Op) => { data?: unknown; error: unknown }): Scenario =>
  op => (op === 'select-track' ? trackFound : rest(op))

describe('setPrimaryStudyTrack — главный маршрут по новой схеме', () => {
  it('новая схема: проверяет маршрут, снимает ДРУГИЕ primary-строки, затем upsert (journey_id,track_id) с role=primary', async () => {
    const { client, chains } = makeClient(withTrack(() => ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await setPrimaryStudyTrack(client as any, input)
    expect(res).toEqual({ ok: true, mode: 'multi' })
    expect(chains.map(c => c.table)).toEqual(['study_tracks', 'journey_study_tracks', 'journey_study_tracks'])

    const sel = chains[0].calls
    expect(sel.map(c => c.method)).toEqual(['select', 'eq', 'maybeSingle'])
    expect(sel[1].args).toEqual(['id', 't2'])

    const del = chains[1].calls
    expect(del.map(c => c.method)).toEqual(['delete', 'eq', 'eq', 'neq'])
    expect(del[1].args).toEqual(['journey_id', 'j1'])
    expect(del[2].args).toEqual(['role', 'primary'])
    expect(del[3].args).toEqual(['track_id', 't2'])   // сам выбранный маршрут НЕ удаляется

    const up = chains[2].calls[0]
    expect(up.method).toBe('upsert')
    const payload = up.args[0] as Record<string, unknown>
    expect(payload).toMatchObject({ journey_id: 'j1', track_id: 't2', role: 'primary', notes: 'hello', updated_by: 'u1' })
    expect(typeof payload.updated_at).toBe('string')
    expect(up.args[1]).toEqual({ onConflict: 'journey_id,track_id' })
  })

  it('notes не переданы (завершение этапа приёма) → ключа notes НЕТ в payload — существующая заметка не стирается', async () => {
    const { client, chains } = makeClient(withTrack(() => ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await setPrimaryStudyTrack(client as any, { journeyId: 'j1', trackId: 't2', updatedBy: 'u1' })
    expect(res).toEqual({ ok: true, mode: 'multi' })
    const payload = chains[2].calls[0].args[0] as Record<string, unknown>
    expect('notes' in payload).toBe(false)
    expect(payload).toMatchObject({ journey_id: 'j1', track_id: 't2', role: 'primary' })
  })

  it('notes: null (панель маршрута очистила поле) → notes: null записывается', async () => {
    const { client, chains } = makeClient(withTrack(() => ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setPrimaryStudyTrack(client as any, { journeyId: 'j1', trackId: 't2', updatedBy: 'u1', notes: null })
    const payload = chains[2].calls[0].args[0] as Record<string, unknown>
    expect('notes' in payload).toBe(true)
    expect(payload.notes).toBeNull()
  })

  it('до миграции (нет колонки role: 42703 или PGRST204) → откат к legacy upsert по journey_id без role', async () => {
    for (const code of ['42703', 'PGRST204']) {
      const { client, chains } = makeClient(withTrack(op => op === 'upsert' ? err(code) : ok))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await setPrimaryStudyTrack(client as any, input)
      expect(res).toEqual({ ok: true, mode: 'legacy' })
      const legacy = chains[3].calls[0]
      expect(legacy.method).toBe('upsert')
      expect(legacy.args[1]).toEqual({ onConflict: 'journey_id' })
      expect((legacy.args[0] as Record<string, unknown>).role).toBeUndefined()
      expect(legacy.args[0]).toMatchObject({ journey_id: 'j1', track_id: 't2', notes: 'hello' })
    }
  })

  it('legacy-откат без notes → ключа notes нет и там', async () => {
    const { client, chains } = makeClient(withTrack(op => op === 'upsert' ? err('42703') : ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setPrimaryStudyTrack(client as any, { journeyId: 'j1', trackId: 't2', updatedBy: 'u1' })
    expect('notes' in (chains[3].calls[0].args[0] as Record<string, unknown>)).toBe(false)
  })

  it('таблицы ещё нет (42P01 / PGRST205) → ok, mode=not_migrated, без throw', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      // journey_study_tracks отсутствует (маршрут-каталог есть)
      const { client } = makeClient(withTrack(() => err(code)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await setPrimaryStudyTrack(client as any, input)).toEqual({ ok: true, mode: 'not_migrated' })
      // и даже сам каталог study_tracks отсутствует
      const { client: c2, chains } = makeClient(() => err(code))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await setPrimaryStudyTrack(c2 as any, input)).toEqual({ ok: true, mode: 'not_migrated' })
      expect(chains).toHaveLength(1) // дальше не идём
    }
  })

  it('неизвестный track_id → ok:false с кодом 23503, и НИЧЕГО не удаляется/не пишется', async () => {
    const { client, chains } = makeClient(op => op === 'select-track' ? { data: null, error: null } : ok)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await setPrimaryStudyTrack(client as any, input)
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error.code).toBe('23503')
    expect(chains.map(c => c.table)).toEqual(['study_tracks'])
  })

  it('ошибка на удалении других primary (кроме «не мигрировано») → ok:false, upsert не выполняется', async () => {
    const { client, chains } = makeClient(withTrack(op => op === 'delete' ? err('XX000') : ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await setPrimaryStudyTrack(client as any, input)
    expect(res.ok).toBe(false)
    expect(chains).toHaveLength(2)
  })

  it('ошибка БД на upsert (например 23503 из-за гонки) → ok:false с кодом — маршрут решает (400)', async () => {
    const { client } = makeClient(withTrack(op => op === 'upsert' ? err('23503') : ok))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await setPrimaryStudyTrack(client as any, input)
    expect(res).toEqual({ ok: false, error: { code: '23503', message: '23503' } })
  })
})

describe('buildPrimaryTrackPayload / normalizeTrackNotes — чистая часть', () => {
  it('notes: trim, пусто → null, обрезка до 2000', () => {
    expect(normalizeTrackNotes('  x ')).toBe('x')
    expect(normalizeTrackNotes('   ')).toBeNull()
    expect(normalizeTrackNotes(null)).toBeNull()
    expect(normalizeTrackNotes(undefined)).toBeNull()
    expect(normalizeTrackNotes('a'.repeat(3000))).toHaveLength(2000)
  })

  it('базовый payload без notes; year_level только в 1..8; reactivate снимает completed_at', () => {
    const base = { journeyId: 'j', trackId: 't', updatedBy: null }
    expect(buildPrimaryTrackPayload(base, 'now')).toEqual({
      journey_id: 'j', track_id: 't', role: 'primary', updated_by: null, updated_at: 'now',
    })
    expect(buildPrimaryTrackPayload({ ...base, notes: ' n ' }, 'now').notes).toBe('n')
    expect(buildPrimaryTrackPayload({ ...base, notes: '' }, 'now').notes).toBeNull()
    expect(buildPrimaryTrackPayload({ ...base, yearLevel: 3 }, 'now').year_level).toBe(3)
    expect(buildPrimaryTrackPayload({ ...base, yearLevel: 0 }, 'now').year_level).toBeUndefined()
    expect(buildPrimaryTrackPayload({ ...base, yearLevel: 9 }, 'now').year_level).toBeUndefined()
    expect(buildPrimaryTrackPayload({ ...base, reactivate: true }, 'now').completed_at).toBeNull()
    expect('completed_at' in buildPrimaryTrackPayload(base, 'now')).toBe(false)
  })
})
