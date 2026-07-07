export const IMPLEMENTED_MODULES = new Set([
  'education', 'tasks', 'settings', 'staff', 'quality_control', 'alumni', 'finance', 'dormitory', 'food', 'maintenance', 'doctor', 'psychologist', 'reports', 'documents',
])

export function isModuleImplemented(moduleCode: string): boolean {
  return IMPLEMENTED_MODULES.has(moduleCode)
}

export const MODULE_COLORS = {
  dashboard:       { primary: '#3B82F6', light: '#DBEAFE', medium: '#60A5FA' },
  persons:         { primary: '#2563EB', light: '#DBEAFE', medium: '#60A5FA' },
  education:       { primary: '#10B981', light: '#D1FAE5', medium: '#34D399' },
  staff:           { primary: '#8B5CF6', light: '#EDE9FE', medium: '#A78BFA' },
  quality_control: { primary: '#EC4899', light: '#FCE7F3', medium: '#F472B6' },
  tasks:           { primary: '#F59E0B', light: '#FEF3C7', medium: '#FBBF24' },
  finance:         { primary: '#059669', light: '#D1FAE5', medium: '#10B981' },
  dormitory:       { primary: '#06B6D4', light: '#CFFAFE', medium: '#22D3EE' },
  food:            { primary: '#D97706', light: '#FEF3C7', medium: '#F59E0B' },
  maintenance:     { primary: '#92400E', light: '#FEF3C7', medium: '#B45309' },
  security:        { primary: '#DC2626', light: '#FEE2E2', medium: '#EF4444' },
  alumni:          { primary: '#DB2777', light: '#FCE7F3', medium: '#EC4899' },
  sponsors:        { primary: '#D97706', light: '#FEF3C7', medium: '#F59E0B' },
  doctor:          { primary: '#059669', light: '#D1FAE5', medium: '#10B981' },
  psychologist:    { primary: '#7C3AED', light: '#EDE9FE', medium: '#A78BFA' },
  documents:       { primary: '#6B7280', light: '#F3F4F6', medium: '#9CA3AF' },
  reports:         { primary: '#16A34A', light: '#DCFCE7', medium: '#22C55E' },
  contacts:        { primary: '#DB2777', light: '#FCE7F3', medium: '#EC4899' },
  settings:        { primary: '#1E40AF', light: '#E0E7FF', medium: '#6366F1' },
} as const

type Shade = 'primary' | 'light' | 'medium'

export function getModuleColor(moduleCode: string, shade: Shade = 'primary'): string {
  const palette = MODULE_COLORS[moduleCode as keyof typeof MODULE_COLORS]
  if (!palette) return shade === 'light' ? '#F3F4F6' : '#6B7280'
  return palette[shade]
}

export function getModuleHeaderGradient(moduleCode: string): string {
  return `linear-gradient(135deg, ${getModuleColor(moduleCode, 'medium')} 0%, ${getModuleColor(moduleCode, 'primary')} 100%)`
}
