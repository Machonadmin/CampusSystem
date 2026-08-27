import { redirect } from 'next/navigation'

/**
 * ЛЕГАСИ-хаб «חינוך»: раньше рендерил гиюс/приём/учёбу второй раз через ?tab=.
 * Разделы давно живут на собственных маршрутах (recruitment / admission /
 * studies), и sidebar ведёт напрямую туда. Оставлен как редирект, чтобы старые
 * хлебные крошки «חינוך» и закладки продолжали работать.
 */
export default function EducationHubRedirect() {
  redirect('/dashboard/education/recruitment')
}
