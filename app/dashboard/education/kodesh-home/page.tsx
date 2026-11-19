import { redirect } from 'next/navigation'

/**
 * Старый адрес «מרחב יהדות». С 19.11.2026 это отдельный модуль меню
 * (/dashboard/kodesh-space, право kodesh_space.access) — старые ссылки и
 * закладки ведём туда.
 */
export default function KodeshHomeRedirect() {
  redirect('/dashboard/kodesh-space')
}
