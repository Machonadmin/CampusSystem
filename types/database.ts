export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enum helpers ────────────────────────────────────────────────────────────

export type Gender = 'female' | 'male' | 'other'
export type RelativeType = 'mother' | 'father' | 'emergency' | 'other'
export type ApplicantStatus = 'new' | 'reviewing' | 'accepted' | 'rejected'
export type Institution = 'university' | 'touro' | 'college' | 'school' | 'emuna' | 'other'
export type EnrollmentStatus = 'active' | 'graduated' | 'expelled' | 'academic_leave'
export type EmploymentType = 'staff' | 'intern' | 'volunteer' | 'contractor'
export type SponsorType = 'individual' | 'organization'
export type RoleCategory = 'system' | 'campus' | 'education' | 'medical' | 'custom'

// ─── Row types ───────────────────────────────────────────────────────────────

export interface PersonRow {
  id: string
  full_name: string
  hebrew_name: string | null
  gender: Gender | null
  birth_date: string | null
  photo_url: string | null
  email: string | null
  phones: Json
  address: Json
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PersonAccountRow {
  id: string
  person_id: string
  login_email: string
  password_hash: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

export interface PersonFamilyRow {
  id: string
  person_id: string
  relative_type: RelativeType | null
  name: string
  phone: string | null
  email: string | null
  relation_note: string | null
}

export interface ApplicantProfileRow {
  id: string
  person_id: string
  status: ApplicantStatus
  application_date: string
  referral_source: string | null
  community_contact_name: string | null
  community_contact_role: string | null
  community_phone: string | null
  community_email: string | null
  notes: string | null
}

export interface EnrollmentRow {
  id: string
  person_id: string
  institution: Institution
  direction: string | null
  level: string | null
  enrollment_date: string | null
  graduation_date: string | null
  status: EnrollmentStatus
  notes: string | null
}

export interface StaffProfileRow {
  id: string
  person_id: string
  employment_type: EmploymentType
  hire_date: string | null
  fire_date: string | null
  notes: string | null
}

export interface DepartmentRow {
  id: string
  name: string
  parent_id: string | null
  head_person_id: string | null
  created_at: string
}

export interface StaffPositionRow {
  id: string
  person_id: string
  department_id: string
  position_ru: string
  position_he: string | null
  is_head: boolean
  start_date: string | null
  end_date: string | null
}

export interface AlumniProfileRow {
  id: string
  person_id: string
  graduation_year: number | null
  institution: string | null
  direction: string | null
  current_location: string | null
  current_occupation: string | null
  notes: string | null
}

export interface SponsorProfileRow {
  id: string
  person_id: string | null
  sponsor_type: SponsorType
  org_name: string | null
  org_contact_name: string | null
  org_contact_phone: string | null
  org_contact_email: string | null
  notes: string | null
}

export interface RoleRow {
  id: string
  name: string
  code: string
  category: RoleCategory | null
  description: string | null
  is_system: boolean
  created_at: string
}

export interface RolePrivilegeRow {
  id: string
  role_id: string
  module: string
  can_create: boolean
  can_view: boolean
  can_edit: boolean
  can_delete: boolean
  is_confidential: boolean
}

export interface PersonRoleRow {
  id: string
  person_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
}

// ─── Insert types (omit server-generated fields) ─────────────────────────────

export type PersonInsert = Omit<PersonRow, 'id' | 'created_at' | 'updated_at'>
export type PersonAccountInsert = Omit<PersonAccountRow, 'id' | 'created_at'>
export type PersonFamilyInsert = Omit<PersonFamilyRow, 'id'>
export type ApplicantProfileInsert = Omit<ApplicantProfileRow, 'id'>
export type EnrollmentInsert = Omit<EnrollmentRow, 'id'>
export type StaffProfileInsert = Omit<StaffProfileRow, 'id'>
export type DepartmentInsert = Omit<DepartmentRow, 'id' | 'created_at'>
export type StaffPositionInsert = Omit<StaffPositionRow, 'id'>
export type AlumniProfileInsert = Omit<AlumniProfileRow, 'id'>
export type SponsorProfileInsert = Omit<SponsorProfileRow, 'id'>
export type RoleInsert = Omit<RoleRow, 'id' | 'created_at'>
export type RolePrivilegeInsert = Omit<RolePrivilegeRow, 'id'>
export type PersonRoleInsert = Omit<PersonRoleRow, 'id' | 'assigned_at'>

// ─── Update types (all fields optional except id) ────────────────────────────

export type PersonUpdate = Partial<PersonInsert>
export type PersonAccountUpdate = Partial<PersonAccountInsert>
export type PersonFamilyUpdate = Partial<PersonFamilyInsert>
export type ApplicantProfileUpdate = Partial<ApplicantProfileInsert>
export type EnrollmentUpdate = Partial<EnrollmentInsert>
export type StaffProfileUpdate = Partial<StaffProfileInsert>
export type DepartmentUpdate = Partial<DepartmentInsert>
export type StaffPositionUpdate = Partial<StaffPositionInsert>
export type AlumniProfileUpdate = Partial<AlumniProfileInsert>
export type SponsorProfileUpdate = Partial<SponsorProfileInsert>
export type RoleUpdate = Partial<RoleInsert>
export type RolePrivilegeUpdate = Partial<RolePrivilegeInsert>
export type PersonRoleUpdate = Partial<PersonRoleInsert>

// ─── Supabase Database interface ─────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      persons: {
        Row: PersonRow
        Insert: PersonInsert
        Update: PersonUpdate
      }
      person_accounts: {
        Row: PersonAccountRow
        Insert: PersonAccountInsert
        Update: PersonAccountUpdate
      }
      person_family: {
        Row: PersonFamilyRow
        Insert: PersonFamilyInsert
        Update: PersonFamilyUpdate
      }
      applicant_profiles: {
        Row: ApplicantProfileRow
        Insert: ApplicantProfileInsert
        Update: ApplicantProfileUpdate
      }
      enrollments: {
        Row: EnrollmentRow
        Insert: EnrollmentInsert
        Update: EnrollmentUpdate
      }
      staff_profiles: {
        Row: StaffProfileRow
        Insert: StaffProfileInsert
        Update: StaffProfileUpdate
      }
      departments: {
        Row: DepartmentRow
        Insert: DepartmentInsert
        Update: DepartmentUpdate
      }
      staff_positions: {
        Row: StaffPositionRow
        Insert: StaffPositionInsert
        Update: StaffPositionUpdate
      }
      alumni_profiles: {
        Row: AlumniProfileRow
        Insert: AlumniProfileInsert
        Update: AlumniProfileUpdate
      }
      sponsor_profiles: {
        Row: SponsorProfileRow
        Insert: SponsorProfileInsert
        Update: SponsorProfileUpdate
      }
      roles: {
        Row: RoleRow
        Insert: RoleInsert
        Update: RoleUpdate
      }
      role_privileges: {
        Row: RolePrivilegeRow
        Insert: RolePrivilegeInsert
        Update: RolePrivilegeUpdate
      }
      person_roles: {
        Row: PersonRoleRow
        Insert: PersonRoleInsert
        Update: PersonRoleUpdate
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
