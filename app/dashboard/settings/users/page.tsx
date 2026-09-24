import { redirect } from 'next/navigation'

// Дубль-поверхность убрана (запрос владельца: меньше дублей). Управление
// пользователями живёт ТОЛЬКО во вкладке «צוות ומשתמשים» хаба «ניהול עובדים»;
// старые ссылки/закладки сюда продолжают работать через redirect.
// Модалки/типы из UsersAccessPanel.tsx по-прежнему переиспользуются хабом.
export default function UsersPage() {
  redirect('/dashboard/staff?tab=users')
}
