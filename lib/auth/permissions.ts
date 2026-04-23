import { getSession } from './session'
import type { RoleCode } from '@/types'

export async function hasRole(code: RoleCode): Promise<boolean> {
  const session = await getSession()
  return session?.roles.includes(code) ?? false
}

export async function hasAnyRole(codes: RoleCode[]): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  return codes.some(code => session.roles.includes(code))
}

export async function isSuperAdmin(): Promise<boolean> {
  return hasRole('superadmin')
}

/** Throws if not authenticated. Use in Server Components / Route Handlers. */
export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHORIZED')
  return session
}
