import { NextRequest, NextResponse } from 'next/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'
import { getPublicFormConfig, savePublicFormConfig } from '@/lib/public/form-config'

/**
 * Управление конфигурацией публичной формы заявки — только набор/גיוס
 * (manage_leads). GET — текущая конфигурация; PUT — сохранить целиком.
 *
 * Валидация/санитизация делается в normalizeConfig (lib/public/form-config),
 * поэтому даже частичный/битый payload не сломает форму.
 */
export async function GET() {
  try {
    await requireEducationPrivilege('manage_leads')
    const config = await getPublicFormConfig()
    return NextResponse.json(config)
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireEducationPrivilege('manage_leads')
    const body = await request.json().catch(() => ({}))
    const saved = await savePublicFormConfig(body, session.person_id)
    return NextResponse.json(saved)
  } catch (err: unknown) {
    return jsonError(err)
  }
}
