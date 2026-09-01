import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { todayISO } from '@/lib/dates'
import { hashPassword, generatePassword } from '@/lib/auth/password'

/**
 * POST /api/staff/onboard — «הוספת בעל תפקיד» одним действием.
 *
 * Централизует ВЕСЬ поток создания сотрудника, который раньше был размазан по
 * 3-4 экранам и 4 эндпоинтам (persons / staff / staff-seat / settings-users).
 * Один вызов делает всё, что нужно, идемпотентно и без частичных дублей:
 *
 *   1. person   — существующий (person_id) ИЛИ создаём нового по имени (+телефон).
 *   2. profile  — гарантируем staff_profiles (+ занятость/зарплата/часы в notes).
 *   3. position — staff_positions: по паре (person, department) обновляем активную
 *                 или создаём. Должность — из каталога (position_id) ИЛИ свободный
 *                 текст (position_label). Идемпотентно → без дублей строк.
 *   4. role     — (опц.) person_roles: добавляем, не затирая другие роли.
 *   5. login    — (опц.) person_accounts с автопаролем (возвращаем его один раз).
 *
 * Право: superadmin (как и все объединяемые эндпоинты).
 */

interface OnboardBody {
  // person
  person_id?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  hebrew_name?: string
  phone?: string
  // seat
  department_id?: string
  position_id?: string
  position_label?: string
  is_head?: boolean
  hire_date?: string | null
  // employment (optional)
  salary?: number | null
  hours?: number | null
  employment_type?: string
  // role (optional)
  role_id?: string
  // login (optional)
  login_email?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as OnboardBody
    const sb = createServerClient()

    // ── validate ────────────────────────────────────────────────────────────
    if (!body.department_id) return apiError('department_id_required', 400)
    if (!body.position_id && !(body.position_label && body.position_label.trim())) {
      return apiError('position_or_position_id_required', 400)
    }
    if (!body.person_id) {
      // Новый человек: нужно имя. Телефон желателен, но не блокируем — экран
      // «бэйл тафкид» собирает минимум; телефон можно дозаполнить в карточке.
      if (!body.first_name?.trim() && !body.last_name?.trim()) return apiError('full_name_required', 400)
    }

    const hireDate = (body.hire_date && String(body.hire_date).trim()) ? String(body.hire_date).trim() : todayISO()

    // ── 1) person ─────────────────────────────────────────────────────────────
    let personId = body.person_id
    if (!personId) {
      const phones = body.phone?.trim() ? [{ type: 'mobile', number: body.phone.trim() }] : []
      const { data: person, error: pErr } = await sb.from('persons').insert({
        last_name: body.last_name?.trim() || null,
        first_name: body.first_name?.trim() || body.last_name?.trim() || '',
        middle_name: body.middle_name?.trim() || null,
        hebrew_name: body.hebrew_name?.trim() || null,
        gender: null, birth_date: null, photo_url: null, email: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        phones: phones as any, address: {}, notes: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).select('id').single()
      if (pErr) throw pErr
      personId = (person as { id: string }).id
    }

    // ── 2) staff_profiles (+ employment payload в notes) ────────────────────────
    const employment: Record<string, unknown> = {}
    if (typeof body.salary === 'number' && body.salary >= 0) employment.contract = { salary: body.salary, currency: 'RUB' }
    if (typeof body.hours === 'number' && body.hours >= 0) employment.work_schedule = String(body.hours)
    const notesJson = Object.keys(employment).length > 0 ? JSON.stringify(employment) : null

    const { data: prof } = await sb.from('staff_profiles').select('id, notes').eq('person_id', personId).maybeSingle()
    if (!prof) {
      const { error: insErr } = await sb.from('staff_profiles').insert({
        person_id: personId,
        hire_date: hireDate,
        employment_type: body.employment_type?.trim() || 'staff',
        notes: notesJson,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      if (insErr) throw insErr
    } else if (notesJson) {
      // Обновляем занятость только если её прислали (не затираем существующее пустым).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await sb.from('staff_profiles').update({ notes: notesJson } as any).eq('id', (prof as { id: string }).id)
      if (upErr) throw upErr
    }

    // ── 3) staff_positions (идемпотентно по person+department) ───────────────────
    // Ярлык должности: из каталога (снапшот name_ru/name_he) или свободный текст.
    let posRu: string | null = null
    let posHe: string | null = null
    let positionId: string | null = null
    if (body.position_id) {
      const { data: refPos } = await sb.from('reference_positions').select('name_ru, name_he').eq('id', body.position_id).maybeSingle()
      if (!refPos) return apiError('position_not_found', 400)
      const p = refPos as { name_ru: string | null; name_he: string | null }
      posRu = p.name_ru
      posHe = p.name_he
      positionId = body.position_id
    } else {
      const label = body.position_label!.trim()
      posRu = label
      posHe = label
    }
    // position_ru — NOT NULL: гарантируем непустую строку.
    const positionRuSafe = posRu || posHe || (body.position_label?.trim() ?? '—')

    const { data: existingPos } = await sb.from('staff_positions')
      .select('id')
      .eq('person_id', personId)
      .eq('department_id', body.department_id)
      .is('end_date', null)
      .maybeSingle()

    const isHead = body.is_head === true
    if (existingPos) {
      const { error } = await sb.from('staff_positions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ position_id: positionId, position_ru: positionRuSafe, position_he: posHe, is_head: isHead } as any)
        .eq('id', (existingPos as { id: string }).id)
      if (error) throw error
    } else {
      const { error } = await sb.from('staff_positions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: personId,
          department_id: body.department_id,
          position_id: positionId,
          position_ru: positionRuSafe,
          position_he: posHe,
          is_head: isHead,
          start_date: hireDate,
          end_date: null,
        } as any)
      if (error) throw error
    }

    // ── 4) role (optional) ──────────────────────────────────────────────────────
    if (body.role_id) {
      const { data: role } = await sb.from('roles').select('id').eq('id', body.role_id).maybeSingle()
      if (!role) return apiError('role_not_found', 400)
      const { data: hasRole } = await sb.from('person_roles')
        .select('id').eq('person_id', personId).eq('role_id', body.role_id).maybeSingle()
      if (!hasRole) {
        const { error } = await sb.from('person_roles')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ person_id: personId, role_id: body.role_id, assigned_by: session.person_id } as any)
        if (error) throw error
      }
    }

    // ── 5) login (optional) ─────────────────────────────────────────────────────
    let generatedPassword: string | undefined
    if (body.login_email && body.login_email.trim()) {
      const email = body.login_email.toLowerCase().trim()
      const { data: existingAcc } = await sb.from('person_accounts').select('id').eq('person_id', personId).maybeSingle()
      if (!existingAcc) {
        const pwd = generatePassword()
        const password_hash = await hashPassword(pwd)
        const { error } = await sb.from('person_accounts')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ person_id: personId, login_email: email, password_hash, is_active: true, last_login: null } as any)
        if (error) {
          const e = error as { code?: string }
          if (e.code === '23505') return apiError('email_in_use', 409)
          throw error
        }
        generatedPassword = pwd
      }
    }

    return NextResponse.json({ ok: true, person_id: personId, generated_password: generatedPassword }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
