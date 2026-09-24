import type { SessionPayload } from '@/lib/auth/jwt'
import { getHeadedUnitIds } from '@/lib/education/unit-access'
import { hasDataSecurityPrivilege } from '@/lib/data-security/permissions'

// ─── Одно правило посадки на все маршруты ────────────────────────────────────
//
// «Посадить человека в единицу» умели четыре маршрута, и каждый спрашивал своё:
// три жёстко требовали роль superadmin, четвёртый — право
// data_security.manage_units, а маршрут состава учебной единицы пускал ещё и
// главу единицы. Одно и то же действие с четырьмя разными ответами на вопрос
// «кому можно» — это не гибкость, а место, где право теряется незаметно.
//
// Здесь оно одно, и оно ОБЪЕДИНЕНИЕ, а не замена: тот, кто сегодня сажает
// людей как глава своей единицы, продолжает это делать. Жёсткий superadmin
// перестаёт быть ЕДИНСТВЕННЫМ условием — самим правом он, разумеется, остаётся.
//
// Почему именно manage_units: это право и означает «менять оргструктуру и
// посадку». Посадка меняет доступ по-настоящему (посаженный видит единицу и всё
// под ней), поэтому право отдельное и помечено критическим.

/**
 * Может ли сессия посадить/снять человека в конкретной единице.
 *
 * Глава считается по staff_positions.is_head — тому же полю, которым
 * авторизация пользуется везде (getHeadedUnitIds), и ТОЛЬКО по своей единице:
 * право главы вниз по дереву не разворачивается. Вниз разворачивается доступ
 * посаженного, а не полномочие сажать.
 */
export async function canSeatInUnit(
  session: SessionPayload | null,
  departmentId: string | null | undefined,
): Promise<boolean> {
  if (!session) return false
  // Изоляция портала: токен студентки никогда не сажает, даже если тот же
  // person где-то оформлен главой.
  if (session.principal === 'student') return false
  if (session.roles.includes('superadmin')) return true
  if (await hasDataSecurityPrivilege(session, 'manage_units')) return true
  if (!departmentId) return false
  const headed = await getHeadedUnitIds(session.person_id)
  return headed.includes(departmentId)
}
