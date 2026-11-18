import { flattenPhones } from '@/lib/persons/phone'
import { NextRequest, NextResponse } from 'next/server'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { requirePersonsPrivilege, hasPersonsPrivilege } from '@/lib/persons/permissions'
import { redactSensitivePerson } from '@/lib/persons/redact'
import { mapDbError } from '@/lib/persons/http'
import { errorResponse } from '@/lib/api/handler'
import { hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * GET /api/persons/directory/[id]
 *
 * ЧИТАЮЩИЙ базовый профиль одного человека для справочника «Люди»: имена,
 * контакты, фото, город, его роли, действующие должности + подразделение и —
 * если он студент — статус обучения, journey_id (для ссылки на карточку
 * студента), год обучения и основная группа. Пол на карточке больше не
 * показываем (заметка владельца 18.11.2026), поэтому он и не отдаётся.
 *
 * Отдельный путь (…/directory/…), чтобы НЕ конфликтовать с существующим
 * GET /api/persons/[id], который отдаёт паспортный профиль другим модулям.
 *
 * Право: persons.view. Только чтение. PGRST116 → 404.
 *
 * Ответ: PersonsDetail
 */


export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requirePersonsPrivilege('view')

    const sb = createServerClient()

    // 1) Базовый профиль человека. .single() → PGRST116 (404), если нет строки.
    const { data: person, error: personErr } = await sb
      .from('persons')
      .select('id, full_name, hebrew_name, email, phones, photo_url, birth_date, address')
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
    // Ярлык должности — с учётом языка (name_he для иврита), падение на снапшот.
    const lang = getCookieLocale()
    const { data: posRows } = await sb
      .from('staff_positions')
      .select('position_ru, position_he, is_head, position:reference_positions(name_ru, name_he), department:departments(name)')
      .eq('person_id', params.id)
      .is('end_date', null)
      .order('is_head', { ascending: false })
    const positions: string[] = []
    let department: string | null = null
    for (const pos of posRows ?? []) {
      const pr = pos as unknown as { position_ru: string | null; position_he: string | null; position: { name_ru: string | null; name_he: string | null } | null; department: unknown }
      const label = lang === 'he'
        ? (pr.position?.name_he || pr.position_he || pr.position?.name_ru || pr.position_ru)
        : (pr.position?.name_ru || pr.position_ru)
      if (label && !positions.includes(label)) positions.push(label)
      if (!department) {
        const dept = pr.department as { name?: string | null } | null
        department = dept?.name ?? null
      }
    }

    // 4) Учебный статус (если студент) — для ссылки на карточку студента,
    //    плюс год обучения и основная группа (их показываем на карточке вместо
    //    пола — заметка владельца 18.11.2026: «важнее, в каком она году и группе»).
    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, education_status, year_level, main_group:study_groups(name, name_he)')
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

    // Город — часть адреса (чувствительное поле): после редакции его нет у
    // тех, кому адрес не положен. Год и группа — учебные данные: только с
    // правом смотреть карточки студентов (education.view_students).
    const addr = p.address as { city?: unknown } | null
    const city = addr && typeof addr.city === 'string' && addr.city.trim() ? addr.city.trim() : null
    const canSeeStudy = journey ? await hasEducationPrivilege(session, 'view_students') : false
    const j = journey as unknown as {
      id: string; education_status: string; year_level: number | null
      main_group: { name: string | null; name_he: string | null } | null
    } | null
    const groupName = j?.main_group
      ? ((lang === 'he' ? (j.main_group.name_he || j.main_group.name) : (j.main_group.name || j.main_group.name_he)) ?? null)
      : null
    return NextResponse.json({
      id: p.id,
      full_name: p.full_name ?? '',
      hebrew_name: p.hebrew_name ?? null,
      email: p.email ?? null,
      phones: flattenPhones(p.phones),
      photo_url: p.photo_url ?? null,
      birth_date: p.birth_date ?? null,
      city,
      roles,
      positions,
      department,
      is_student: !!journey,
      journey_id: journey?.id ?? null,
      education_status: journey?.education_status ?? null,
      year_level: canSeeStudy ? (j?.year_level ?? null) : null,
      group_name: canSeeStudy ? groupName : null,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
