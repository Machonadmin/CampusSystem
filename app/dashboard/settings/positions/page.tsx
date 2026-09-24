import { redirect } from 'next/navigation'

// Дубль-поверхность убрана (запрос владельца: меньше дублей). Каталог
// должностей живёт ТОЛЬКО во вкладке «תוארי משרה» хаба «ניהול עובדים»;
// старые ссылки/закладки сюда продолжают работать через redirect.
// PositionsPanel.tsx по-прежнему переиспользуется хабом (embedded).
export default function PositionsPage() {
  redirect('/dashboard/staff?tab=positions')
}
