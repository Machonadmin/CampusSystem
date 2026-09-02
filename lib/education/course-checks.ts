/**
 * Проверки готовности курса кодеша (spec §4.5, новые предупреждения):
 * курс без преподавателя / без часов / без слота расписания / без аудитории, и
 * расхождение заявленных часов курса с фактически расставленными. Чистые функции —
 * тестируются без БД, используются на экранах курсов и «הכנת הסמסטר».
 */

export type CourseIssue =
  | 'no_teacher'
  | 'no_hours'
  | 'no_slot'
  | 'no_room'
  | 'hours_shortfall'
  | 'hours_excess'

export interface CourseForCheck {
  teacherCount: number
  hours: number | null            // заявленные часы курса (class_groups.hours)
  slotCount: number               // число слотов расписания
  roomCount: number               // сколько слотов имеют аудиторию (room/room_id)
  scheduledHours?: number | null  // фактически расставленные часы (Σ длительностей слотов), если известны
}

export function courseIssues(c: CourseForCheck): CourseIssue[] {
  const issues: CourseIssue[] = []
  if (c.teacherCount <= 0) issues.push('no_teacher')
  if (c.hours === null || c.hours <= 0) issues.push('no_hours')
  if (c.slotCount <= 0) issues.push('no_slot')
  else if (c.roomCount < c.slotCount) issues.push('no_room')

  if (c.hours && c.hours > 0 && typeof c.scheduledHours === 'number') {
    if (c.scheduledHours < c.hours) issues.push('hours_shortfall')
    else if (c.scheduledHours > c.hours) issues.push('hours_excess')
  }
  return issues
}

export function courseHasBlockingGap(c: CourseForCheck): boolean {
  const issues = courseIssues(c)
  return issues.includes('no_teacher') || issues.includes('no_slot')
}
