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

/** person_relatives — связи person↔person с типом отношения. */
export type RelationType =
  | 'mother' | 'father' | 'parent'
  | 'spouse' | 'child' | 'sibling' | 'grandparent'
  | 'guardian'
  | 'community_contact' | 'emergency_contact'
  | 'other'

export interface PersonRelativeRow {
  id: string
  person_id: string
  relative_id: string
  relation_type: RelationType
  notes: string | null
  created_at: string
  updated_at: string
}
export type PersonRelativeInsert =
  Omit<PersonRelativeRow, 'id' | 'created_at' | 'updated_at'>
  & { id?: string }
export type PersonRelativeUpdate = Partial<Omit<PersonRelativeInsert, 'person_id' | 'relative_id'>>
export type ApplicantStatus = 'new' | 'reviewing' | 'accepted' | 'rejected'
export type EmploymentType = 'staff' | 'intern' | 'volunteer' | 'contractor'
export type SponsorType = 'individual' | 'organization'
export type RoleCategory = 'system' | 'campus' | 'education' | 'medical' | 'custom' | 'external'
export type PositionCategory = 'academic' | 'administrative' | 'support'

export type TaskModule = 'general' | 'education' | 'staff' | 'quality_control'
export type TaskAssigneeType = 'person' | 'department' | 'position' | 'unassigned'
export type TaskStatus =
  | 'unassigned'
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled'
  | 'declined'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskCommentType = 'comment' | 'decline_reason' | 'status_note'

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
  last_name: string | null
  first_name: string
  middle_name: string | null
  full_name: string         // GENERATED ALWAYS — read-only, не записывать
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
  updated_at: string
}

export interface PersonFamilyRow {
  id: string
  person_id: string
  relative_type: RelativeType | null
  name: string
  phone: string | null
  email: string | null
  relation_note: string | null
  created_at: string
}

/**
 * Статусы journey. БД-enum `person_education_status` пока содержит только
 * 'lead'|'applicant'|'student'|'alumni'. Остальные значения зарезервированы
 * под расширение enum в Part 2 миграции; до этого вставка 'graduated' и т.п.
 * вернёт ошибку enum-инварианта.
 */
export type JourneyStatus =
  | 'lead'
  | 'applicant'
  | 'student'
  | 'graduated'
  | 'expelled'
  | 'lost'
  | 'on_leave'

export interface EducationJourneyRow {
  id: string
  person_id: string

  // Статус journey
  education_status: JourneyStatus | null

  // Системные даты
  created_at: string
  updated_at: string

  // Даты
  opened_at: string
  closed_at: string | null
  application_date: string | null
  interview_date: string | null
  decision_date: string | null

  // Источник
  referral_source: string | null
  rejection_reason: string | null

  // ЛЕГАСИ-поля (удалим в Part 2)
  community_contact_name: string | null
  community_contact_role: string | null
  community_phone: string | null
  community_email: string | null
  institution: string | null
  direction: string | null
  level: string | null

  // Желаемое (для лида/абитуриента)
  desired_department_id: string | null
  desired_specialty_id: string | null

  // Студенческие
  primary_department_id: string | null
  specialty_id: string | null
  main_group_id: string | null
  year_level: number | null
  year_start: number | null
  enrolled_at: string | null

  status: string | null   // legacy: 'new' | 'reviewing' | 'accepted' | 'rejected'
  notes: string | null

  // Soft delete
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: string | null
}

export type ProcessEventType = 'system' | 'note' | 'call' | 'meeting' | 'message' | 'email'

export interface ProcessEventRow {
  id: string
  stage_instance_id: string
  event_type: ProcessEventType
  content: string
  author_id: string | null
  metadata: Json
  created_at: string
}

/**
 * Insert: только person_id обязателен. Остальные поля имеют DB-defaults
 * (opened_at, status, education_status, application_date) или nullable.
 */
export type EducationJourneyInsert = {
  id?: string
  person_id: string
  education_status?: JourneyStatus | null
  opened_at?: string
  closed_at?: string | null
  application_date?: string | null
  interview_date?: string | null
  decision_date?: string | null
  referral_source?: string | null
  rejection_reason?: string | null
  community_contact_name?: string | null
  community_contact_role?: string | null
  community_phone?: string | null
  community_email?: string | null
  institution?: string | null
  direction?: string | null
  level?: string | null
  desired_department_id?: string | null
  desired_specialty_id?: string | null
  primary_department_id?: string | null
  specialty_id?: string | null
  main_group_id?: string | null
  year_level?: number | null
  year_start?: number | null
  enrolled_at?: string | null
  status?: string | null
  notes?: string | null
}
export type EducationJourneyUpdate = Partial<EducationJourneyInsert>

/** Backward-compat алиас: старый код может ссылаться на ApplicantProfileRow. */
export type ApplicantProfileRow = EducationJourneyRow

export interface CommunityRow {
  id: string
  name: string
  name_he: string | null
  country: string
  city: string
  default_contact_name: string | null
  default_contact_role: string | null
  default_contact_phone: string | null
  default_contact_email: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export type CommunityInsert =
  Omit<CommunityRow, 'id' | 'created_at' | 'updated_at' | 'is_active'>
  & { id?: string; is_active?: boolean }
export type CommunityUpdate = Partial<CommunityInsert>

export interface JourneyCommunityRow {
  journey_id: string
  community_id: string
  contact_name: string | null
  contact_role: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  added_at: string
  created_at: string
}
export type JourneyCommunityInsert =
  Omit<JourneyCommunityRow, 'added_at' | 'created_at'>
  & { added_at?: string }
export type JourneyCommunityUpdate = Partial<JourneyCommunityInsert>

// ─── Documents module ─────────────────────────────────────────────────────────

export type PersonDocumentStatus = 'pending' | 'received' | 'verified' | 'rejected' | 'expired'

export interface DocumentCategoryRow {
  id: string
  code: string
  name_ru: string
  sort_order: number
  created_at: string
}

export interface DocumentTypeRow {
  id: string
  category_id: string
  code: string
  name_ru: string
  description: string | null
  is_required: boolean
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface PersonDocumentRow {
  id: string
  person_id: string
  document_type_id: string
  status: PersonDocumentStatus
  file_url: string | null
  notes: string | null
  received_at: string | null
  received_by: string | null
  verified_at: string | null
  verified_by: string | null
  created_at: string
  updated_at: string
}
export type PersonDocumentInsert = Omit<PersonDocumentRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  status?: PersonDocumentStatus
}
export type PersonDocumentUpdate = Partial<PersonDocumentInsert>

/** Заполняется триггером audit_log_trigger — приложение не пишет сюда напрямую. */
export interface AuditLogRow {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  old_data: Json | null
  new_data: Json | null
  changed_fields: string[] | null
  changed_by: string | null
  changed_at: string
}
export type AuditLogInsert = Omit<AuditLogRow, 'id' | 'changed_at'> & { id?: string }
export type AuditLogUpdate = Partial<AuditLogInsert>

export type JourneyDocumentStatus = 'pending' | 'received' | 'verified' | 'rejected' | 'expired'

export interface JourneyDocumentRow {
  id: string
  journey_id: string
  document_type: string
  status: JourneyDocumentStatus
  file_url: string | null
  notes: string | null
  uploaded_at: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}
export type JourneyDocumentInsert =
  Omit<JourneyDocumentRow, 'id' | 'created_at' | 'updated_at' | 'status'>
  & { id?: string; status?: JourneyDocumentStatus }
export type JourneyDocumentUpdate = Partial<JourneyDocumentInsert>

export interface LeadInterestRow {
  id: string
  person_id: string
  direction_id: string | null
  level_id: string | null
  free_text: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PersonStatusHistoryRow {
  id: string
  person_id: string
  from_status: PersonEducationStatus | null
  to_status: PersonEducationStatus
  changed_at: string
  changed_by: string | null
  comment: string | null
  created_at: string
}

export interface StaffProfileRow {
  id: string
  person_id: string
  employment_type: EmploymentType
  hire_date: string | null
  fire_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DepartmentRow {
  id: string
  name: string
  parent_id: string | null
  head_person_id: string | null
  is_educational_institution: boolean
  created_at: string
  updated_at: string
}

export interface StaffPositionRow {
  id: string
  person_id: string
  department_id: string
  position_ru: string
  position_he: string | null
  position_id: string | null
  is_head: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
}

export interface RoleRow {
  id: string
  name: string
  code: RoleCode
  category: RoleCategory | null
  description: string | null
  is_system: boolean
  created_at: string
  updated_at: string
}

/** Replaces the boolean-column model from migration 001 */
export interface RolePrivilegeRow {
  id: string
  role_id: string
  module: PrivilegeModule
  privilege_code: string
  scope: 'all' | 'department' | 'own'
  granted_at: string
  granted_by: string | null
  created_at: string
}

export interface PersonRoleRow {
  id: string
  person_id: string
  role_id: string
  assigned_at: string
  assigned_by: string | null
  created_at: string
}

export interface ModulePrivilegeRow {
  id: string
  module: PrivilegeModule
  privilege_code: string
  privilege_name: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
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
  created_at: string
}

// ─── Insert types (omit server-generated fields) ─────────────────────────────

export type PersonInsert =
  Omit<PersonRow, 'id' | 'created_at' | 'updated_at' | 'full_name' | 'marital_status' | 'nationality' | 'passport_number'>
  & { marital_status?: string | null; nationality?: string | null; passport_number?: string | null }
export type PersonAccountInsert = Omit<PersonAccountRow, 'id' | 'created_at' | 'updated_at'>
export type PersonFamilyInsert = Omit<PersonFamilyRow, 'id' | 'created_at'>
/** Backward-compat алиас: ApplicantProfileInsert ≡ EducationJourneyInsert. */
export type ApplicantProfileInsert = EducationJourneyInsert
export type StaffProfileInsert = Omit<StaffProfileRow, 'id' | 'created_at' | 'updated_at'>
export type DepartmentInsert = Omit<DepartmentRow, 'id' | 'created_at' | 'updated_at' | 'is_educational_institution'> & {
  is_educational_institution?: boolean
}
export type StaffPositionInsert = Omit<StaffPositionRow, 'id' | 'created_at' | 'updated_at'>
export type AlumniProfileInsert = Omit<AlumniProfileRow, 'id' | 'created_at' | 'updated_at'>
export type SponsorProfileInsert = Omit<SponsorProfileRow, 'id' | 'created_at' | 'updated_at'>
export type RoleInsert = Omit<RoleRow, 'id' | 'created_at' | 'updated_at'>
export type RolePrivilegeInsert = Omit<RolePrivilegeRow, 'id' | 'granted_at' | 'scope' | 'created_at'> & {
  scope?: 'all' | 'department' | 'own'
}
export type PersonRoleInsert = Omit<PersonRoleRow, 'id' | 'assigned_at' | 'created_at'>
export type ModulePrivilegeInsert = Omit<ModulePrivilegeRow, 'id' | 'created_at' | 'updated_at'>
export type PersonPrivilegeInsert = Omit<PersonPrivilegeRow, 'id' | 'granted_at' | 'created_at'>
export type LeadInterestInsert = Omit<LeadInterestRow, 'id' | 'created_at' | 'notes'> & { notes?: string | null }
export type LeadInterestUpdate = Partial<LeadInterestInsert>
export type PersonStatusHistoryInsert = Omit<PersonStatusHistoryRow, 'id' | 'changed_at' | 'comment' | 'created_at'> & { comment?: string | null }
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
  class_group_id: string | null
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
  updated_at: string
  completed_at: string | null
}
export interface QualityCheckInsert {
  template_id?: string | null
  class_group_id?: string | null
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
  updated_at: string
}
export interface ReferenceCityInsert {
  id?: string
  country: string
  city: string
}
export type ReferenceCityUpdate = Partial<ReferenceCityInsert>

export interface ReferencePositionRow {
  id: string
  name_ru: string
  name_he: string | null
  category: PositionCategory
  is_teaching: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
export type ReferencePositionInsert = Omit<ReferencePositionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}
export type ReferencePositionUpdate = Partial<ReferencePositionInsert>

// ─── Каскад направлений (reference_directions / reference_levels) ────────────────

export interface ReferenceDirectionRow {
  id: string
  department_id: string
  name_ru: string
  code: string | null
  has_levels: boolean
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export type ReferenceDirectionInsert = Omit<ReferenceDirectionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}
export type ReferenceDirectionUpdate = Partial<ReferenceDirectionInsert>

export interface ReferenceLevelRow {
  id: string
  direction_id: string
  name_ru: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export type ReferenceLevelInsert = Omit<ReferenceLevelRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
}
export type ReferenceLevelUpdate = Partial<ReferenceLevelInsert>

// ─── Tasks module ─────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string
  title: string
  description: string | null
  module: TaskModule
  metadata: Json
  assignee_type: TaskAssigneeType
  assignee_id: string | null
  department_id: string | null
  position_id: string | null
  creator_id: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null      // ISO date 'YYYY-MM-DD'
  due_time: string | null      // 'HH:MM:SS'
  due_all_day: boolean
  claimed_at: string | null
  recurrence_series_id: string | null  // UUID серии, NULL для разовых
  recurrence_rule: Json | null          // см. структуру в миграции
  recurrence_position: number | null    // порядковый номер в серии
  stage_instance_id: string | null
  stage_task_template_id: string | null  // FK на шаблон задачи (NULL для legacy)
  created_at: string
  updated_at: string
  completed_at: string | null
}
export interface TaskInsert {
  id?: string
  title: string
  description?: string | null
  module?: TaskModule
  metadata?: Json
  assignee_type?: TaskAssigneeType
  assignee_id?: string | null
  department_id?: string | null
  position_id?: string | null
  creator_id: string
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  due_time?: string | null
  due_all_day?: boolean
  claimed_at?: string | null
  completed_at?: string | null
  recurrence_series_id?: string | null
  recurrence_rule?: Json | null
  recurrence_position?: number | null
  stage_instance_id?: string | null
  stage_task_template_id?: string | null
}
export type TaskUpdate = Partial<TaskInsert>

export interface TaskCommentRow {
  id: string
  task_id: string
  author_id: string
  content: string
  comment_type: TaskCommentType
  created_at: string
  updated_at: string
}
export interface TaskCommentInsert {
  id?: string
  task_id: string
  author_id: string
  content: string
  comment_type?: TaskCommentType
}
export type TaskCommentUpdate = Partial<TaskCommentInsert>

export interface TaskWatcherRow {
  task_id: string
  person_id: string
  added_by: string | null
  added_at: string
  created_at: string
}
export interface TaskWatcherInsert {
  task_id: string
  person_id: string
  added_by?: string | null
}

export interface TaskStatusHistoryRow {
  id: string
  task_id: string
  actor_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  note: string | null
  created_at: string
}
export interface TaskStatusHistoryInsert {
  id?: string
  task_id: string
  actor_id: string
  from_status?: TaskStatus | null
  to_status: TaskStatus
  note?: string | null
}
export type TaskStatusHistoryUpdate = Partial<TaskStatusHistoryInsert>

// ─── Education module ─────────────────────────────────────────────────────────

export type StudentStatus = 'active' | 'on_leave' | 'graduated' | 'expelled'

export interface SpecialtyRow {
  id: string
  department_id: string
  name: string
  name_he: string | null
  code: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface SpecialtyInsert {
  id?: string
  department_id: string
  name: string
  name_he?: string | null
  code?: string | null
  sort_order?: number
  is_active?: boolean
}
export type SpecialtyUpdate = Partial<SpecialtyInsert>

export interface SubjectRow {
  id: string
  department_id: string
  name: string
  name_he: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface SubjectInsert {
  id?: string
  department_id: string
  name: string
  name_he?: string | null
  sort_order?: number
  is_active?: boolean
}
export type SubjectUpdate = Partial<SubjectInsert>

export interface StudyGroupRow {
  id: string
  department_id: string
  specialty_id: string | null
  name: string
  name_he: string | null
  year_level: number | null
  year_start: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface StudyGroupInsert {
  id?: string
  department_id: string
  specialty_id?: string | null
  name: string
  name_he?: string | null
  year_level?: number | null
  year_start?: number | null
  notes?: string | null
  is_active?: boolean
}
export type StudyGroupUpdate = Partial<StudyGroupInsert>

export interface StudentRow {
  id: string
  person_id: string
  primary_department_id: string
  specialty_id: string | null
  main_group_id: string | null
  status: StudentStatus
  year_level: number | null
  year_start: number | null
  enrolled_at: string        // ISO date 'YYYY-MM-DD'
  notes: string | null
  created_at: string
  updated_at: string
}
export interface StudentInsert {
  id?: string
  person_id: string
  primary_department_id: string
  specialty_id?: string | null
  main_group_id?: string | null
  status?: StudentStatus
  year_level?: number | null
  year_start?: number | null
  enrolled_at?: string
  notes?: string | null
}
export type StudentUpdate = Partial<StudentInsert>

export interface ClassGroupRow {
  id: string
  department_id: string
  name: string
  subject_id: string
  level: string | null
  period_start: string | null  // ISO date 'YYYY-MM-DD'
  period_end: string | null    // ISO date 'YYYY-MM-DD'
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface ClassGroupInsert {
  id?: string
  department_id: string
  name: string
  subject_id: string
  level?: string | null
  period_start?: string | null
  period_end?: string | null
  notes?: string | null
  is_active?: boolean
}
export type ClassGroupUpdate = Partial<ClassGroupInsert>

export interface ClassEnrollmentRow {
  journey_id: string
  class_group_id: string
  enrolled_at: string
  created_at: string
}
export interface ClassEnrollmentInsert {
  journey_id: string
  class_group_id: string
  enrolled_at?: string
}
export type ClassEnrollmentUpdate = Partial<ClassEnrollmentInsert>

export interface ClassTeacherRow {
  class_group_id: string
  teacher_id: string
  added_at: string
  added_by: string | null
  is_primary: boolean
  created_at: string
}
export interface ClassTeacherInsert {
  class_group_id: string
  teacher_id: string
  added_at?: string
  added_by?: string | null
  is_primary?: boolean
}

// ─── Lessons & Attendance (управление учёбой, фаза A) ──────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'

export interface LessonRow {
  id: string
  class_group_id: string
  scheduled_date: string          // ISO date 'YYYY-MM-DD'
  scheduled_time: string | null   // 'HH:MM:SS'
  topic: string | null
  description: string | null
  location: string | null
  is_cancelled: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}
export interface LessonInsert {
  id?: string
  class_group_id: string
  scheduled_date: string
  scheduled_time?: string | null
  topic?: string | null
  description?: string | null
  location?: string | null
  is_cancelled?: boolean
  created_by?: string | null
}
export type LessonUpdate = Partial<Omit<LessonInsert, 'class_group_id' | 'created_by'>>

export interface AttendanceRow {
  id: string
  lesson_id: string
  journey_id: string
  status: AttendanceStatus
  created_at: string
  updated_at: string
  marked_by: string | null
  marked_at: string | null
}
export interface AttendanceInsert {
  id?: string
  lesson_id: string
  journey_id: string
  status: AttendanceStatus
  marked_by?: string | null
  marked_at?: string | null
}
export type AttendanceUpdate = Partial<Omit<AttendanceInsert, 'lesson_id' | 'journey_id'>>


// ─── Assessments & Grades (управление учёбой, фаза B: оценки) ──────────────────

export interface AssessmentRow {
  id: string
  class_group_id: string
  title: string
  max_score: number
  assessment_date: string | null   // ISO date 'YYYY-MM-DD'
  description: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}
export interface AssessmentInsert {
  id?: string
  class_group_id: string
  title: string
  max_score?: number
  assessment_date?: string | null
  description?: string | null
  created_by?: string | null
}
export type AssessmentUpdate = Partial<Omit<AssessmentInsert, 'class_group_id' | 'created_by'>>

export interface GradeRow {
  id: string
  assessment_id: string
  journey_id: string
  score: number
  comment: string | null
  created_at: string
  updated_at: string
  graded_by: string | null
  graded_at: string | null
}
export interface GradeInsert {
  id?: string
  assessment_id: string
  journey_id: string
  score: number
  comment?: string | null
  graded_by?: string | null
  graded_at?: string | null
}
export type GradeUpdate = Partial<Omit<GradeInsert, 'assessment_id' | 'journey_id'>>

// ─── Class schedule slots (управление учёбой: расписание) ─────────────────────

export interface ScheduleSlotRow {
  id: string
  class_group_id: string
  day_of_week: number             // ISO: 1=Mon .. 7=Sun
  start_time: string              // 'HH:MM:SS'
  end_time: string                // 'HH:MM:SS'
  room: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}
export interface ScheduleSlotInsert {
  id?: string
  class_group_id: string
  day_of_week: number
  start_time: string
  end_time: string
  room?: string | null
  created_by?: string | null
}
export type ScheduleSlotUpdate = Partial<Omit<ScheduleSlotInsert, 'class_group_id' | 'created_by'>>

// ─── Finance (биллинг обучения) ───────────────────────────────────────────────

export interface FinanceChargeRow {
  id: string
  journey_id: string
  amount: number
  description: string
  period_label: string | null
  due_date: string | null          // ISO date 'YYYY-MM-DD'
  status: 'active' | 'cancelled'
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface FinanceChargeInsert {
  id?: string
  journey_id: string
  amount: number
  description: string
  period_label?: string | null
  due_date?: string | null
  status?: 'active' | 'cancelled'
  created_by?: string | null
}
export type FinanceChargeUpdate = Partial<Omit<FinanceChargeInsert, 'journey_id' | 'created_by'>>

export interface FinancePaymentRow {
  id: string
  journey_id: string
  amount: number
  paid_at: string                  // ISO date 'YYYY-MM-DD'
  method: string | null
  reference: string | null
  status: 'pending' | 'approved' | 'cancelled'
  recorded_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}
export interface FinancePaymentInsert {
  id?: string
  journey_id: string
  amount: number
  paid_at: string
  method?: string | null
  reference?: string | null
  status?: 'pending' | 'approved' | 'cancelled'
  recorded_by?: string | null
  approved_by?: string | null
  approved_at?: string | null
}
export type FinancePaymentUpdate = Partial<Omit<FinancePaymentInsert, 'journey_id' | 'recorded_by'>>

// ─── Workflow Engine ──────────────────────────────────────────────────────────

export interface ProcessTemplateRow {
  id:          string
  code:        string
  name_ru:     string
  description: string | null
  is_active:   boolean
  created_at:  string
  updated_at:  string
}
export type ProcessTemplateInsert = Omit<ProcessTemplateRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}
export type ProcessTemplateUpdate = Partial<ProcessTemplateInsert>

export interface StageTemplateRow {
  id:                  string
  process_template_id: string
  code:                string
  name_ru:             string
  description:         string | null
  has_tasks:           boolean
  has_action_log:      boolean
  is_optional:         boolean
  is_addable:          boolean
  sort_order:          number
  created_at:          string
  updated_at:          string
}
export type StageTemplateInsert = Omit<StageTemplateRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
}
export type StageTemplateUpdate = Partial<StageTemplateInsert>

export interface StageTaskTemplateRow {
  id:                    string
  stage_template_id:     string
  code:                  string
  title:                 string
  description:           string | null
  default_assignee_type: 'role' | 'department' | 'position' | 'creator' | 'manual' | null
  default_role_code:     string | null
  default_position_id:   string | null
  default_department_id: string | null
  default_priority:      'low' | 'normal' | 'high' | 'urgent'
  default_due_days:      number | null
  sort_order:            number
  created_at:            string
  updated_at:            string
}
export type StageTaskTemplateInsert = Omit<StageTaskTemplateRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
}
export type StageTaskTemplateUpdate = Partial<StageTaskTemplateInsert>

export interface StageFinalRow {
  id:                    string
  stage_template_id:     string
  code:                  string
  name_ru:               string
  is_positive:           boolean
  closes_process:        boolean
  process_finish_reason: string | null
  sort_order:            number
  created_at:            string
  updated_at:            string
}
export type StageFinalInsert = Omit<StageFinalRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type StageFinalUpdate = Partial<StageFinalInsert>

export interface StageTransitionRow {
  id:                    string
  from_stage_template_id: string | null
  to_stage_template_id:  string
  trigger_final_code:    string | null
  activation_mode:       'after_one' | 'after_all'
  sort_order:            number
  created_at:            string
  updated_at:            string
}
export type StageTransitionInsert = Omit<StageTransitionRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type StageTransitionUpdate = Partial<StageTransitionInsert>

export interface TaskTransitionRow {
  id:                string
  stage_template_id: string
  from_task_code:    string | null   // NULL = стартовая задача
  to_task_code:      string
  activation_mode:   'after_one' | 'after_all'
  sort_order:        number
  created_at:        string
  updated_at:        string
}
export type TaskTransitionInsert = Omit<TaskTransitionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
}
export type TaskTransitionUpdate = Partial<TaskTransitionInsert>

export type ProcessInstanceStatus = 'active' | 'completed' | 'cancelled'

export interface ProcessInstanceRow {
  id:                  string
  process_template_id: string
  journey_id:          string
  status:              ProcessInstanceStatus
  collected_data:      Record<string, unknown>
  started_at:          string
  finished_at:         string | null
  finish_reason:       string | null
  created_by:          string | null
  created_at:          string
  updated_at:          string
}
export type ProcessInstanceInsert = Omit<ProcessInstanceRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}
export type ProcessInstanceUpdate = Partial<ProcessInstanceInsert>

export type StageInstanceStatus = 'waiting' | 'active' | 'completed' | 'skipped' | 'cancelled'

export interface StageInstanceRow {
  id:                  string
  process_instance_id: string
  stage_template_id:   string
  status:              StageInstanceStatus
  final_code:          string | null
  result_data:         Record<string, unknown> | null
  activated_at:        string | null
  completed_at:        string | null
  completed_by:        string | null
  notes:               string | null
  created_at:          string
  updated_at:          string
}
export type StageInstanceInsert = Omit<StageInstanceRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}
export type StageInstanceUpdate = Partial<StageInstanceInsert>

export interface StageActionRow {
  id:                string
  stage_instance_id: string
  action_type:       string
  content:           string
  metadata:          Record<string, unknown> | null
  created_by:        string | null
  created_at:        string
  updated_at:        string
}
export type StageActionInsert = Omit<StageActionRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
}
export type StageActionUpdate = Partial<StageActionInsert>

// ─── Update types (all fields optional) ──────────────────────────────────────

export type PersonUpdate = Partial<PersonInsert>
export type PersonAccountUpdate = Partial<PersonAccountInsert>
export type PersonFamilyUpdate = Partial<PersonFamilyInsert>
export type ApplicantProfileUpdate = Partial<ApplicantProfileInsert>
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

// ─── Dormitory (общежитие) ───────────────────────────────────────────────────

export interface DormBuildingRow {
  id: string
  name: string
  code: string | null
  gender: 'male' | 'female' | 'mixed'
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface DormBuildingInsert {
  id?: string
  name: string
  code?: string | null
  gender?: 'male' | 'female' | 'mixed'
  address?: string | null
  notes?: string | null
  is_active?: boolean
}
export type DormBuildingUpdate = Partial<DormBuildingInsert>

export interface DormRoomRow {
  id: string
  building_id: string
  room_number: string
  floor: number | null
  capacity: number
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface DormRoomInsert {
  id?: string
  building_id: string
  room_number: string
  floor?: number | null
  capacity: number
  notes?: string | null
  is_active?: boolean
}
export type DormRoomUpdate = Partial<Omit<DormRoomInsert, 'building_id'>>

export interface DormAssignmentRow {
  id: string
  room_id: string
  journey_id: string
  assigned_from: string            // ISO date 'YYYY-MM-DD'
  assigned_to: string | null       // ISO date | null (open-ended)
  status: 'active' | 'ended'
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface DormAssignmentInsert {
  id?: string
  room_id: string
  journey_id: string
  assigned_from: string
  assigned_to?: string | null
  status?: 'active' | 'ended'
  created_by?: string | null
}
export type DormAssignmentUpdate = Partial<Omit<DormAssignmentInsert, 'room_id' | 'journey_id' | 'created_by'>>

// ─── Food & Dining (питание) ─────────────────────────────────────────────────

export interface MealPlanRow {
  id: string
  name: string
  code: string | null
  description: string | null
  includes_breakfast: boolean
  includes_lunch: boolean
  includes_dinner: boolean
  price: number | null
  period_label: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface MealPlanInsert {
  id?: string
  name: string
  code?: string | null
  description?: string | null
  includes_breakfast?: boolean
  includes_lunch?: boolean
  includes_dinner?: boolean
  price?: number | null
  period_label?: string | null
  is_active?: boolean
}
export type MealPlanUpdate = Partial<MealPlanInsert>

export interface MealEnrollmentRow {
  id: string
  meal_plan_id: string
  journey_id: string
  enrolled_from: string            // ISO date 'YYYY-MM-DD'
  enrolled_to: string | null       // ISO date | null (open-ended)
  status: 'active' | 'ended'
  created_by: string | null
  created_at: string
  updated_at: string
}
export interface MealEnrollmentInsert {
  id?: string
  meal_plan_id: string
  journey_id: string
  enrolled_from: string
  enrolled_to?: string | null
  status?: 'active' | 'ended'
  created_by?: string | null
}
export type MealEnrollmentUpdate = Partial<Omit<MealEnrollmentInsert, 'meal_plan_id' | 'journey_id' | 'created_by'>>

export interface DietaryProfileRow {
  id: string
  journey_id: string
  restrictions: string | null
  allergies: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
export interface DietaryProfileInsert {
  id?: string
  journey_id: string
  restrictions?: string | null
  allergies?: string | null
  notes?: string | null
}
export type DietaryProfileUpdate = Partial<Omit<DietaryProfileInsert, 'journey_id'>>

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
      person_relatives:  T<PersonRelativeRow,   PersonRelativeInsert,   PersonRelativeUpdate>
      applicant_profiles:T<ApplicantProfileRow, ApplicantProfileInsert, ApplicantProfileUpdate>
      education_journeys:T<EducationJourneyRow, EducationJourneyInsert, EducationJourneyUpdate>
      communities:       T<CommunityRow,        CommunityInsert,        CommunityUpdate>
      journey_communities:T<JourneyCommunityRow,JourneyCommunityInsert, JourneyCommunityUpdate>
      journey_documents: T<JourneyDocumentRow,  JourneyDocumentInsert,  JourneyDocumentUpdate>
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
      reference_positions:       T<ReferencePositionRow,         ReferencePositionInsert,         ReferencePositionUpdate>
      reference_directions:      T<ReferenceDirectionRow,        ReferenceDirectionInsert,        ReferenceDirectionUpdate>
      reference_levels:          T<ReferenceLevelRow,            ReferenceLevelInsert,            ReferenceLevelUpdate>
      tasks:                     T<TaskRow,                      TaskInsert,                      TaskUpdate>
      task_comments:             T<TaskCommentRow,               TaskCommentInsert,               TaskCommentUpdate>
      task_watchers:             T<TaskWatcherRow,               TaskWatcherInsert,               TaskWatcherInsert>
      task_status_history:       T<TaskStatusHistoryRow,         TaskStatusHistoryInsert,         TaskStatusHistoryUpdate>
      specialties:               T<SpecialtyRow,                 SpecialtyInsert,                 SpecialtyUpdate>
      subjects:                  T<SubjectRow,                   SubjectInsert,                   SubjectUpdate>
      study_groups:              T<StudyGroupRow,                StudyGroupInsert,                StudyGroupUpdate>
      students:                  T<StudentRow,                   StudentInsert,                   StudentUpdate>
      class_groups:              T<ClassGroupRow,                ClassGroupInsert,                ClassGroupUpdate>
      class_enrollments:         T<ClassEnrollmentRow,           ClassEnrollmentInsert,           ClassEnrollmentUpdate>
      class_teachers:            T<ClassTeacherRow,              ClassTeacherInsert,              ClassTeacherInsert>
      lessons:                   T<LessonRow,                    LessonInsert,                    LessonUpdate>
      attendance:                T<AttendanceRow,                AttendanceInsert,                AttendanceUpdate>
      assessments:               T<AssessmentRow,                AssessmentInsert,                AssessmentUpdate>
      grades:                    T<GradeRow,                     GradeInsert,                     GradeUpdate>
      class_schedule_slots:      T<ScheduleSlotRow,              ScheduleSlotInsert,              ScheduleSlotUpdate>
      finance_charges:           T<FinanceChargeRow,             FinanceChargeInsert,             FinanceChargeUpdate>
      finance_payments:          T<FinancePaymentRow,            FinancePaymentInsert,            FinancePaymentUpdate>
      process_templates:         T<ProcessTemplateRow,           ProcessTemplateInsert,           ProcessTemplateUpdate>
      stage_templates:           T<StageTemplateRow,             StageTemplateInsert,             StageTemplateUpdate>
      stage_task_templates:      T<StageTaskTemplateRow,         StageTaskTemplateInsert,         StageTaskTemplateUpdate>
      stage_finals:              T<StageFinalRow,                StageFinalInsert,                StageFinalUpdate>
      stage_transitions:         T<StageTransitionRow,           StageTransitionInsert,           StageTransitionUpdate>
      task_transitions:          T<TaskTransitionRow,            TaskTransitionInsert,            TaskTransitionUpdate>
      process_instances:         T<ProcessInstanceRow,           ProcessInstanceInsert,           ProcessInstanceUpdate>
      stage_instances:           T<StageInstanceRow,             StageInstanceInsert,             StageInstanceUpdate>
      stage_actions:             T<StageActionRow,               StageActionInsert,               StageActionUpdate>
      document_categories:       T<DocumentCategoryRow,          DocumentCategoryRow,             Partial<DocumentCategoryRow>>
      document_types:            T<DocumentTypeRow,              DocumentTypeRow,                 Partial<DocumentTypeRow>>
      person_documents:          T<PersonDocumentRow,            PersonDocumentInsert,            PersonDocumentUpdate>
      audit_log:                 T<AuditLogRow,                  AuditLogInsert,                  AuditLogUpdate>
      dorm_buildings:            T<DormBuildingRow,              DormBuildingInsert,              DormBuildingUpdate>
      dorm_rooms:                T<DormRoomRow,                  DormRoomInsert,                  DormRoomUpdate>
      dorm_assignments:          T<DormAssignmentRow,            DormAssignmentInsert,            DormAssignmentUpdate>
      meal_plans:                T<MealPlanRow,                  MealPlanInsert,                  MealPlanUpdate>
      meal_enrollments:          T<MealEnrollmentRow,            MealEnrollmentInsert,            MealEnrollmentUpdate>
      dietary_profiles:          T<DietaryProfileRow,            DietaryProfileInsert,            DietaryProfileUpdate>
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
      create_application: {
        Args: { payload: Record<string, unknown> }
        Returns: { person_id: string; journey_id: string }
      }
      create_staff_member: {
        Args: { payload: Record<string, unknown> }
        Returns: {
          profile_id: string | null
          person_id: string
          full_name: string
          position: string
          department_id: string
        }
      }
      reactivate_stage: {
        Args: { p_stage_instance_id: string; p_actor_id: string }
        Returns: { stage_instance_id: string }
      }
      start_process: {
        Args: { p_process_code: string; p_journey_id: string; p_actor_id: string | null }
        Returns: { process_instance_id: string; stage_instance_ids: string[]; already_existed: boolean }
      }
      handle_task_completion: {
        Args: { p_task_id: string; p_actor_id: string }
        Returns: { created_task_ids: string[] }
      }
      close_process_early: {
        Args: { p_process_instance_id: string; p_final_code: string; p_actor_id: string | null }
        Returns: { process_instance_id: string; final_code: string; finish_reason: string; journey_converted: boolean }
      }
      complete_stage: {
        Args: { p_stage_instance_id: string; p_final_code: string; p_actor_id: string | null; p_result_data?: Record<string, unknown> | null }
        Returns: { stage_instance_id: string; activated_stage_ids: string[]; process_completed: boolean; finish_reason: string | null }
      }
      transition_education_status: {
        Args: {
          p_journey_id: string
          p_to_status: string
          p_actor_id: string | null
          p_reason?: string | null
          p_effective_date?: string | null
        }
        Returns: { journey_id: string; from_status: string; to_status: string }
      }
    }
    Enums: Record<string, never>
  }
}
