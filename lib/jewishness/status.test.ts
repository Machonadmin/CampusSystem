import { describe, it, expect } from 'vitest'
import { setJewishnessStatus } from './status'

/**
 * Первичная проверка рава без заметки не должна стирать прежнюю заметку в
 * карточке (решение владельца 2026-10-19). Остальные пути — как раньше.
 */

function makeClient() {
  const updates: Array<Record<string, unknown>> = []
  const sb = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        update(payload: Record<string, unknown>) { if (table === 'education_journeys') updates.push(payload); return chain },
        insert() { return chain },
        eq() { return chain },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(resolve) },
      }
      return chain
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: sb as any, updates }
}

describe('setJewishnessStatus — заметка', () => {
  it('первичная проверка без заметки не трогает прежнюю', async () => {
    const { sb, updates } = makeClient()
    await setJewishnessStatus(sb, { journeyId: 'j', status: 'pending', changedBy: 'rav', note: '', source: 'initial_check' })
    expect(updates).toHaveLength(1)
    expect(updates[0]).not.toHaveProperty('jewishness_notes')
    expect(updates[0]).toMatchObject({ jewishness_status: 'pending', jewishness_initial_checked_by: 'rav' })
  })

  it('первичная проверка с заметкой её записывает', async () => {
    const { sb, updates } = makeClient()
    await setJewishnessStatus(sb, { journeyId: 'j', status: 'pending', changedBy: 'rav', note: 'סריקות תקינות', source: 'initial_check' })
    expect(updates[0]).toMatchObject({ jewishness_notes: 'סריקות תקינות' })
  })

  it('финальное решение — как раньше: заметка пишется всегда', async () => {
    const { sb, updates } = makeClient()
    await setJewishnessStatus(sb, { journeyId: 'j', status: 'verified', changedBy: 'chana', note: null, source: 'module' })
    expect(updates[0]).toMatchObject({ jewishness_status: 'verified', jewishness_notes: null, jewishness_verified_by: 'chana' })
  })
})
