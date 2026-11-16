import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import type { RequestError } from './requests'

/** Ошибка заявки / назначения встречи → HTTP-ответ с переводом. */
export function meetingsError(err: RequestError, time?: string): NextResponse {
  switch (err) {
    case 'subject_required': return apiError('meetings_subject_required', 400)
    case 'invalid_input': return apiError('meetings_invalid_input', 400)
    case 'target_not_available': return apiError('meetings_target_not_available', 400)
    case 'not_found': return apiError('meeting_not_found', 404)
    case 'action_not_allowed': return apiError('meetings_action_not_allowed', 409)
    case 'invalid_time': return apiError('meetings_invalid_time', 400)
    case 'overlap': return apiError('meeting_overlap', 409)
    case 'blocked': return apiError('meetings_blocked_day', 409)
    case 'lesson':
      return NextResponse.json(
        { error: serverT('meetings_lesson_overlap').replace('{time}', time ?? ''), code: 'meetings_lesson_overlap' },
        { status: 409 },
      )
  }
}
