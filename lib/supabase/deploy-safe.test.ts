import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Deploy-safe на hosted Supabase ───────────────────────────────────────────
//
// Между деплоем и ручным запуском миграции таблицы/колонки ещё нет. На hosted
// Supabase такой запрос отбивает PostgREST по schema cache — с кодом PGRST205
// (таблица) / PGRST204 (колонка), а НЕ Postgres-кодами 42P01/42703. Гарды,
// проверявшие только 42P01/42703, промахивались → 500 вместо «пусто».
//
// Здесь — ключевые пути с ЗАГЛУШКОЙ Supabase, которая на запросы к «ещё не
// мигрированным» таблицам отвечает как PostgREST (PGRST205), а на остальные —
// заданными данными. Все они обязаны деградировать до пустого результата, а
// не бросать. Для паритета прогоняем и 42P01.

type Resp = { data: unknown; error: unknown; count?: number | null }

function missingError(code: string, table: string) {
  const message = code === 'PGRST204' || code === '42703'
    ? `Could not find the 'zz' column of '${table}' in the schema cache`
    : `Could not find the table 'public.${table}' in the schema cache`
  return { code, message, details: null, hint: null }
}

/**
 * Заглушка клиента: from(table) → цепочка любых методов, thenable.
 * `missing` — какие таблицы «ещё не мигрированы» ('all' = все) → ошибка `code`;
 * `rows[table]` — данные для остальных (по умолчанию пустой список).
 */
function makeClient(code: string, missing: 'all' | Set<string>, rows: Record<string, unknown[]> = {}) {
  const calls: Array<{ table: string; methods: string[] }> = []
  function chain(table: string): unknown {
    const rec = { table, methods: [] as string[] }
    calls.push(rec)
    const resp: Resp = (missing === 'all' || missing.has(table))
      ? { data: null, error: missingError(code, table), count: null }
      : { data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length }
    const p = Promise.resolve(resp)
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') return p.then.bind(p)
        return (...args: unknown[]) => { rec.methods.push(prop); void args; return proxy }
      },
    })
    return proxy
  }
  return {
    client: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: missingError(code, 'rpc') }) },
    calls,
  }
}

// Одна студентка, финально одобренная по еврейству — чтобы kodesh-home дошёл до
// запросов journey_study_tracks / study_tracks / student_alerts (они выполняются
// только при непустом списке journeys).
const ONE_STUDENT = {
  education_journeys: [{ id: 'j1', person: { id: 'p1', full_name: 'Test Student', hebrew_name: null, photo_url: null } }],
}

// Маршрут kodesh-home читает сессию и клиент через модули — мокаем их.
const { getSessionMock, clientRef } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  clientRef: { current: null as unknown },
}))
vi.mock('@/lib/auth/session', () => ({ getSession: getSessionMock }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => clientRef.current }))

import { loadNoLessonDateSet, loadCalendarByDate } from '@/lib/education/no-lesson-days'
import { setJewishnessStatus } from '@/lib/jewishness/status'
import { ensureSemesterTuitionCharges } from '@/lib/education/semester-tuition'
import { GET as kodeshHomeGET } from '@/app/api/education/kodesh/home/route'

const superadmin = () => ({
  person_id: 'u-sa', login_email: 'sa@test', full_name: 'Super', roles: ['superadmin'], principal: 'staff',
})

const NEW_KODESH_TABLES = new Set(['journey_study_tracks', 'study_tracks', 'student_alerts', 'teacher_course_approvals'])

for (const code of ['PGRST205', '42P01']) {
  describe(`таблица отсутствует (${code}) → деградация до пустого, не throw`, () => {
    it('no-lesson-days: loadNoLessonDateSet → пустое множество', async () => {
      const { client } = makeClient(code, 'all')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const set = await loadNoLessonDateSet(client as any, null, '2026-09-01', '2026-09-30')
      expect(set.size).toBe(0)
    })

    it('no-lesson-days: loadCalendarByDate → пустая карта (после отката к legacy-модели)', async () => {
      const { client } = makeClient(code, 'all')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = await loadCalendarByDate(client as any, 'dept-1', '2026-09-01', '2026-09-30')
      expect(map.size).toBe(0)
    })

    it('jewishness: setJewishnessStatus → false (статус не записан, но не падает)', async () => {
      const { client } = makeClient(code, 'all')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await setJewishnessStatus(client as any, {
        journeyId: 'j1', status: 'verified', changedBy: 'u1', source: 'acceptance_stage',
      })
      expect(ok).toBe(false)
    })

    it('semester-tuition: ensureSemesterTuitionCharges → { created: 0 } без throw', async () => {
      const { client } = makeClient(code, 'all')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await ensureSemesterTuitionCharges(client as any, {
        id: 'g1', name: 'Semester', year_label: 'תשפ"ז', term_number: 1, tuition_amount: 1000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, ['j1', 'j2'], 'u1')
      expect(res.created).toBe(0)
    })

    it('GET /api/education/kodesh/home: ВСЕ таблицы отсутствуют → 200 { prep: null, students: [] }', async () => {
      getSessionMock.mockResolvedValue(superadmin())
      clientRef.current = makeClient(code, 'all').client
      const res = await kodeshHomeGET(new NextRequest('http://localhost/api/education/kodesh/home'))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ prep: null, students: [] })
    })

    it('GET /api/education/kodesh/home: есть студентка, отсутствуют только НОВЫЕ таблицы модуля → 200, студентка без маршрута/алертов', async () => {
      getSessionMock.mockResolvedValue(superadmin())
      const { client, calls } = makeClient(code, NEW_KODESH_TABLES, ONE_STUDENT)
      clientRef.current = client
      const res = await kodeshHomeGET(new NextRequest('http://localhost/api/education/kodesh/home'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.prep).toMatchObject({ students_total: 1, assigned: 0, unassigned: 1, pending_teacher_approvals: 0 })
      expect(body.students).toHaveLength(1)
      expect(body.students[0]).toMatchObject({ journey_id: 'j1', primary_track_name: null, year_level: null, alerts_open: 0 })
      // Гарды действительно сработали: до «отсутствующих» таблиц маршрут ДОШЁЛ.
      const touched = new Set(calls.map(c => c.table))
      expect(touched.has('journey_study_tracks')).toBe(true)
      expect(touched.has('student_alerts')).toBe(true)
      expect(touched.has('teacher_course_approvals')).toBe(true)
    })
  })
}

describe('колонка отсутствует (PGRST204) распознаётся там же, где 42703', () => {
  for (const code of ['PGRST204', '42703']) {
    it(`kodesh-home: ${code} на journey_study_tracks (гард isMissingRelation) → 200, студентка без маршрута`, async () => {
      getSessionMock.mockResolvedValue(superadmin())
      const { client, calls } = makeClient(code, new Set(['journey_study_tracks']), ONE_STUDENT)
      clientRef.current = client
      const res = await kodeshHomeGET(new NextRequest('http://localhost/api/education/kodesh/home'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.students).toHaveLength(1)
      expect(body.students[0].primary_track_name).toBeNull()
      expect(calls.some(c => c.table === 'journey_study_tracks')).toBe(true)
    })
  }
})
