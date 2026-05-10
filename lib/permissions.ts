export type FeaturePerms = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }
export type FeatureAccess = Record<string, Record<string, FeaturePerms>>

export function hasFeatureAccess(
  featureAccess: FeatureAccess | undefined,
  moduleCode: string,
  featureCode: string,
  action: keyof FeaturePerms = 'can_view',
): boolean {
  return featureAccess?.[moduleCode]?.[featureCode]?.[action] ?? false
}
