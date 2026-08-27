import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { requireFinancePrivilege, hasFinancePrivilege } from '@/lib/finance/permissions'

/**
 * Плата за обучение (שכר לימוד) по РЕАЛЬНЫМ семестрам.
 *
 * Решение владельца: сумму школьной платы задаёт «Финансы», а не «Учёба».
 * Реальный семестр — это class_groups с is_semester=true (единый объект
 * «семестр-группа», см. миграцию unify_semester_class_group). Здесь Финансы
 * видят открытые семестры и задают им tuition_amount; при сохранении суммы
 * порождаются счета tuition для уже зачисленных студенток (PATCH /[id]).
 *
 * GET — список семестров с суммой и числом зачисленных (право finance.view).
 * Деплой-безопасно: если колонки is_semester ещё нет — пустой список.
 */
export async function GET() {
  try {
    const session = await requireFinancePrivilege('view')
    const canManage = await hasFinancePrivilege(session, 'create_invoice')
    const sb = createServerClient()

    // `*` + фильтр is_semester — deploy-safe (вернёт новые колонки после миграции,
    // опустит до неё). При отсутствии колонки/таблицы — пустой список.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: groups, error } = await (sb
      .from('class_groups')
      .select('id, name, name_he, tuition_amount, year_label, term_number, sem_status, track:study_tracks(id, name_he, name_ru, name_en)')
      .eq('is_semester', true)
      .order('year_label', { ascending: false })
      .order('term_number', { ascending: true }) as any)

    if (error) {
      if (isMissingRelation(error)) return NextResponse.json({ semesters: [], can_manage: canManage })
      throw error
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (groups ?? []) as any[]
    if (rows.length === 0) return NextResponse.json({ semesters: [], can_manage: canManage })

    // Число зачисленных студенток по каждому семестру.
    const ids = rows.map(g => g.id as string)
    const counts = new Map<string, number>()
    const { data: enrolls } = await sb
      .from('class_enrollments')
      .select('class_group_id')
      .in('class_group_id', ids)
    for (const r of enrolls ?? []) {
      counts.set(r.class_group_id, (counts.get(r.class_group_id) ?? 0) + 1)
    }

    const semesters = rows.map(g => ({
      id: g.id,
      name: g.name,
      name_he: g.name_he ?? null,
      year_label: g.year_label ?? null,
      term_number: g.term_number ?? null,
      status: (g.sem_status ?? 'open') as 'open' | 'closed',
      tuition_amount: g.tuition_amount ?? null,
      study_track: g.track ?? null,
      students_count: counts.get(g.id) ?? 0,
    }))

    return NextResponse.json({ semesters, can_manage: canManage })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (isMissingRelation(e)) return NextResponse.json({ semesters: [], can_manage: false })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
