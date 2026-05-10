export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enum helpers ────────────────────────────────────────────────────────────

export type Gender = 'female' | 'male' | 'other'
export type PersonEducationStatus = 'lead' | 'applicant' | 'student' | 'alumni'
export type RelativeType = 'mother' | 'father' | 'emergency' | 'other'
export type ApplicantStatus = 'new' | 'reviewing' | 'accepted' | 'rejected'
export type Institution = 'university' | 'touro' | 'college' | 'school' | 'emuna' | 'other'
export type EnrollmentStatus = 'active' | 'graduated' | 'expelled' | 'academic_leave'
export type EmploymentType = 'staff' | 'intern' | 'volunteer' | 'contractor'
export type SponsorType = 'individual' | 'organization'
export type RoleCategory = 'system' | 'campus' | 'education' | 'medical' | 'custom' | 'external'

export type RoleCode =
  | 'superadmin' | 'tech_admin'
  | 'campus_president' | 'president_secretary'
  | 'finance_director' | 'accountant' | 'lawyer'
  | 'rector' | 'dean' | 'school_director' | 'vice_director' | 'dept_head' | 'program_head'
  | 'teacher' | 'curator'
  | 'student' | 'pupil'
  | 'dorm_director' | 'embait' | 'mashgiach'
  | 'doctor' | 'psychologist'
  | 'security_head' | 'security_guard'
  | 'maintenance_head' | 'maintenance_staff'
  | 'kitchen_head' | 'kitchen_staff'
  | 'technical_staff'
  | 'applicant' | 'alumni' | 'sponsor'

export type PrivilegeModule =
  | 'persons' | 'applicants' | 'education' | 'finance'
  | 'dormitory' | 'food' | 'security' | 'doctor' | 'psychologist'
  | 'alumni' | 'sponsors' | 'tasks' | 'documents' | 'reports' | 'settings'

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
  education_status: PersonEducationStatus | null
  marital_status: string | null
  nationality: string | null
  passport_number: string | null
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
  education_status: PersonEducationStatus | null
  institution: string | null
  direction: string | null
  level: string | null
  interview_date: string | null
  decision_date: string | null
  rejection_reason: string | null
}

export interface LeadInterestRow {
  id: string
  person_id: string
  institution: string
  direction: string | null
  notes: string | null
  created_at: string
}

export interface PersonStatusHistoryRow {
  id: string
  person_id: string
  from_status: PersonEducationStatus | null
  to_status: PersonEducationStatus
  changed_at: string
  changed_by: string | null
  comment: string | null
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
  code: RoleCode
  category: RoleCategory | null
  description: string | null
  is_system: boolean
  created_at: string
}

/** Replaces the boolean-column model from migration 001 */
export interface RolePrivilegeRow {
  id: string
  role_id: string
  module: PrivilegeModule
  privilege_code: string
  granted_at: string
  granted_by: string | null
}

export interface PersonRoleRow {
  id: string
  person_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
}

export interface ModulePrivilegeRow {
  id: string
  module: PrivilegeModule
  privilege_code: string
  privilege_name: string
  description: string | null
  sort_order: number
}

export interface PersonPrivilegeRow {
  id: string
  person_id: string
  module: PrivilegeModule
  privilege_code: string
  is_granted: boolean
  reason: string | null
  expires_at: string | null
  granted_at: string
  granted_by: string | null
}

// ─── Insert types (omit server-generated fields) ─────────────────────────────

export type PersonInsert =
  Omit<PersonRow, 'id' | 'created_at' | 'updated_at' | 'education_status' | 'marital_status' | 'nationality' | 'passport_number'>
  & { education_status?: PersonEducationStatus | null; marital_status?: string | null; nationality?: string | null; passport_number?: string | null }
export type PersonAccountInsert = Omit<PersonAccountRow, 'id' | 'created_at'>
export type PersonFamilyInsert = Omit<PersonFamilyRow, 'id'>
export type ApplicantProfileInsert =
  Omit<ApplicantProfileRow, 'id' | 'education_status' | 'institution' | 'direction' | 'level' | 'interview_date' | 'decision_date' | 'rejection_reason'>
  & { education_status?: PersonEducationStatus | null; institution?: string | null; direction?: string | null; level?: string | null; interview_date?: string | null; decision_date?: string | null; rejection_reason?: string | null }
export type EnrollmentInsert = Omit<EnrollmentRow, 'id'>
export type StaffProfileInsert = Omit<StaffProfileRow, 'id'>
export type DepartmentInsert = Omit<DepartmentRow, 'id' | 'created_at'>
export type StaffPositionInsert = Omit<StaffPositionRow, 'id'>
export type AlumniProfileInsert = Omit<AlumniProfileRow, 'id'>
export type SponsorProfileInsert = Omit<SponsorProfileRow, 'id'>
export type RoleInsert = Omit<RoleRow, 'id' | 'created_at'>
export type RolePrivilegeInsert = Omit<RolePrivilegeRow, 'id' | 'granted_at'>
export type PersonRoleInsert = Omit<PersonRoleRow, 'id' | 'assigned_at'>
export type ModulePrivilegeInsert = Omit<ModulePrivilegeRow, 'id'>
export type PersonPrivilegeInsert = Omit<PersonPrivilegeRow, 'id' | 'granted_at'>
export type LeadInterestInsert = Omit<LeadInterestRow, 'id' | 'created_at' | 'notes'> & { notes?: string | null }
export type LeadInterestUpdate = Partial<LeadInterestInsert>
export type PersonStatusHistoryInsert = Omit<PersonStatusHistoryRow, 'id' | 'changed_at' | 'comment'> & { comment?: string | null }
export type PersonStatusHistoryUpdate = Partial<PersonStatusHistoryInsert>

export interface QualityCheckTemplateRow {
  id: string
  name: string
  description: string | null
  structure: Record<string, unknown>
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface QualityCheckTemplateInsert {
  name: string
  description?: string | null
  structure: Record<string, unknown>
  is_active?: boolean
  created_by?: string | null
}
export type QualityCheckTemplateUpdate = Partial<QualityCheckTemplateInsert>

export interface QualityCheckRow {
  id: string
  template_id: string | null
  lesson_date: string
  lesson_time: string
  observer_person_id: string
  teacher_person_id: string
  group_name: string | null
  course_name: string | null
  started_on_time: boolean | null
  delay_minutes: number | null
  delay_reason: string | null
  technical_issues: string | null
  answers: Record<string, unknown> | null
  strengths: string | null
  areas_for_improvement: string | null
  action_item: string | null
  overall_rating: number | null
  teacher_feedback: string | null
  status: string
  created_by: string | null
  created_at: string
  completed_at: string | null
}
export interface QualityCheckInsert {
  template_id?: string | null
  lesson_date: string
  lesson_time: string
  observer_person_id: string
  teacher_person_id: string
  group_name?: string | null
  course_name?: string | null
  started_on_time?: boolean | null
  delay_minutes?: number | null
  delay_reason?: string | null
  technical_issues?: string | null
  answers?: Record<string, unknown> | null
  strengths?: string | null
  areas_for_improvement?: string | null
  action_item?: string | null
  overall_rating?: number | null
  teacher_feedback?: string | null
  status?: string
  created_by?: string | null
  completed_at?: string | null
}
export type QualityCheckUpdate = Partial<QualityCheckInsert>

export interface FeaturePrivilegeRow {
  id: string
  role_code: string
  module_code: string
  feature_code: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}
export interface FeaturePrivilegeInsert {
  id?: string
  role_code: string
  module_code: string
  feature_code: string
  can_view?: boolean
  can_create?: boolean
  can_edit?: boolean
  can_delete?: boolean
}
export type FeaturePrivilegeUpdate = Partial<FeaturePrivilegeInsert>

export interface ReferenceCityRow {
  id: string
  country: string
  city: string
  created_at?: string
}
export interface ReferenceCityInsert {
  id?: string
  country: string
  city: string
}
export type ReferenceCityUpdate = Partial<ReferenceCityInsert>

// ─── Update types (all fields optional) ──────────────────────────────────────

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
export type ModulePrivilegeUpdate = Partial<ModulePrivilegeInsert>
export type PersonPrivilegeUpdate = Partial<PersonPrivilegeInsert>

// ─── Supabase Database interface ─────────────────────────────────────────────

// Makes Row/Insert/Update satisfy supabase-js GenericTable (requires index sig)
type T<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>
  Insert: Insert & Record<string, unknown>
  Update: Update & Record<string, unknown>
  Relationships: never[]
}

export interface Database {
  public: {
    Tables: {
      persons:           T<PersonRow,           PersonInsert,           PersonUpdate>
      person_accounts:   T<PersonAccountRow,    PersonAccountInsert,    PersonAccountUpdate>
      person_family:     T<PersonFamilyRow,     PersonFamilyInsert,     PersonFamilyUpdate>
      applicant_profiles:T<ApplicantProfileRow, ApplicantProfileInsert, ApplicantProfileUpdate>
      enrollments:       T<EnrollmentRow,       EnrollmentInsert,       EnrollmentUpdate>
      staff_profiles:    T<StaffProfileRow,     StaffProfileInsert,     StaffProfileUpdate>
      departments:       T<DepartmentRow,       DepartmentInsert,       DepartmentUpdate>
      staff_positions:   T<StaffPositionRow,    StaffPositionInsert,    StaffPositionUpdate>
      alumni_profiles:   T<AlumniProfileRow,    AlumniProfileInsert,    AlumniProfileUpdate>
      sponsor_profiles:  T<SponsorProfileRow,   SponsorProfileInsert,   SponsorProfileUpdate>
      roles:             T<RoleRow,             RoleInsert,             RoleUpdate>
      role_privileges:   T<RolePrivilegeRow,    RolePrivilegeInsert,    RolePrivilegeUpdate>
      person_roles:      T<PersonRoleRow,       PersonRoleInsert,       PersonRoleUpdate>
      module_privileges: T<ModulePrivilegeRow,  ModulePrivilegeInsert,  ModulePrivilegeUpdate>
      person_privileges:       T<PersonPrivilegeRow,          PersonPrivilegeInsert,          PersonPrivilegeUpdate>
      lead_interests:            T<LeadInterestRow,              LeadInterestInsert,              LeadInterestUpdate>
      person_status_history:     T<PersonStatusHistoryRow,       PersonStatusHistoryInsert,       PersonStatusHistoryUpdate>
      quality_check_templates:   T<QualityCheckTemplateRow,      QualityCheckTemplateInsert,      QualityCheckTemplateUpdate>
      quality_checks:            T<QualityCheckRow,              QualityCheckInsert,              QualityCheckUpdate>
      feature_privileges:        T<FeaturePrivilegeRow,          FeaturePrivilegeInsert,          FeaturePrivilegeUpdate>
      reference_cities:          T<ReferenceCityRow,             ReferenceCityInsert,             ReferenceCityUpdate>
    }
    Views: Record<string, never>
    Functions: {
      verify_login: {
        Args: { p_email: string }
        Returns: Array<{
          person_id: string
          login_email: string
          password_hash: string
          is_active: boolean
          full_name: string
          roles: string[]
        }>
      }
      update_last_login: {
        Args: { p_person_id: string }
        Returns: void
      }
    }
    Enums: Record<string, never>
  }
}
