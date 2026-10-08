import FeedbackListClient from './FeedbackListClient'

/**
 * «ההערות שלי» — замечания, которые сотрудник отправил кнопкой
 * «הצעה לשיפור או באג», с их статусом и ответом владельца. Владелец
 * (superadmin) видит здесь все замечания и может менять статус. Доступ решает
 * /api/feedback; без права страница показывает «нет доступа».
 */
export default function FeedbackPage() {
  return <FeedbackListClient />
}
