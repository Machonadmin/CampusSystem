import { redirect } from 'next/navigation'

/**
 * «נוכחות מורים» объединена со страницей «מורים ושעות» в единую «מורים»
 * (решение владельца). Старый адрес сохраняем как редирект — ссылки/закладки
 * продолжают работать; клиент TeacherAttendanceClient живёт как вкладка там.
 */
export default function TeacherAttendancePage() {
  redirect('/dashboard/education/teachers')
}
