import { redirect } from 'next/navigation'

/**
 * «מורים ושעות» объединена со страницей «נוכחות מורים» в единую «מורים»
 * (решение владельца). Старый адрес сохраняем как редирект — ссылки/закладки
 * продолжают работать; клиент TeachersHoursClient живёт как вкладка там.
 */
export default function TeachersHoursPage() {
  redirect('/dashboard/education/teachers')
}
