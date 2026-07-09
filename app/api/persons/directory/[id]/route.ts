import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePersonsPrivilege, hasPersonsPrivilege } from '@/lib/persons/permissions'
import { redactSensitivePerson } from '@/lib/persons/redact'
import { mapDbError } from '@/lib/persons/http'

/**
 * GET /api/persons/directory/[id]
 *
 * ЧИТАЮЩИЙ базовый профиль одного человека для справочника «Люди»: имена,
 * контакты, фото, его роли, действующие должности + подразделение и — если он
 * студент — статус обучения и journey_id (для ссылки на карточку студента).
 *
 * Отдельный путь (…/directory/…), чтобы НЕ конфликтовать с существующим
 * GET /api/persons/[id], который отдаёт паспортный профиль другим модулям.
 *
 * Право: persons.view. Только чтение. PGRST116 → 404.
 *
 * Ответ: PersonsDetail
 */

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requirePersonsPrivilege('view')

    const sb = createServerClient()

    // 1) Базовый профиль человека. .single() → PGRST116 (404), если нет строки.
    const { data: person, error: personErr } = await sb
      .from('persons')
      .select('id, full_name, hebrew_name, email, phones, photo_url, gender, birth_date')
      .eq('id', params.id)
      .single()
    if (personErr) throw personErr

    // 2) Роли человека (метки). Читаем метку роли из roles.name.
    const { data: roleRows } = await sb
      .from('person_roles')
      .select('role:roles(code, name)')
      .eq('person_id', params.id)
    const roles = (roleRows ?? [])
      .map(r => {
        const role = (r as { role: unknown }).role as { code?: string; name?: string } | null
        return role ? { code: role.code ?? '', name: role.name ?? role.code ?? '' } : null
      })
      .filter((r): r is { code: string; name: string } => !!r && !!r.name)

    // 3) Действующие должности + подразделение (если сотрудник).
    const { data: posRows } = await sb
      .from('staff_positions')
      .select('position_ru, is_head, department:departments(name)')
      .eq('person_id', params.id)
      .is('end_date', null)
      .order('is_head', { ascending: false })
    const positions: string[] = []
    let department: string | null = null
    for (const pos of posRows ?? []) {
      const pr = pos as { position_ru: string | null; department: unknown }
      if (pr.position_ru && !positions.includes(pr.position_ru)) positions.push(pr.position_ru)
      if (!department) {
        const dept = pr.department as { name?: string | null } | null
        department = dept?.name ?? null
      }
    }

    // 4) Учебный статус (если студент) — для ссылки на карточку студента.
    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, education_status')
      .eq('person_id', params.id)
      .eq('education_status', 'student')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Чувствительные PII-поля (здесь применимо birth_date) обнуляем, если у
    // вызывающего нет 'persons.view_sensitive'.
    const canSeeSensitive = await hasPersonsPrivilege(session, 'view_sensitive')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = redactSensitivePerson(person as Record<string, unknown>, canSeeSensitive) as any
    return NextResponse.json({
      id: p.id,
      full_name: p.full_name ?? '',
      hebrew_name: p.hebrew_name ?? null,
      email: p.email ?? null,
      phones: flattenPhones(p.phones),
      photo_url: p.photo_url ?? null,
      gender: p.gender ?? null,
      birth_date: p.birth_date ?? null,
      roles,
      positions,
      department,
      is_student: !!journey,
      journey_id: journey?.id ?? null,
      education_status: journey?.education_status ?? null,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
