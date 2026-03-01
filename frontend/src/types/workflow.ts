// ─── JSON Config Types ────────────────────────────────────────────────────────

export type FieldType =
  | 'textbox'
  | 'textarea'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file_upload'
  | 'ocr_reader'
  | 'calculated'
  | 'table'

export interface TableColumn {
  col_id: string
  col_label: string
  col_type: 'textbox' | 'number' | 'calculated'
  formula?: string
}

export interface FormField {
  field_id: string
  field_label: string
  field_type: FieldType
  required?: boolean
  placeholder?: string
  default?: unknown
  options?: string[]
  options_source?: 'inline' | 'list' | 'api'
  list_name?: string
  formula?: string
  read_only?: boolean
  accepted_formats?: string[]
  extract_fields?: Record<string, string>
  columns?: TableColumn[]
}

export interface WorkflowStep {
  step_id: number
  step_name: string
  step_label: string
  approvers: string[]
  form_fields: FormField[]
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface WorkflowDefinition {
  id: string
  name: string
  description: string | null
  config: WorkflowStep[]
  status: 'draft' | 'published' | 'archived'
  created_by: string | null
  created_at: string
  published_at: string | null
}

export interface WorkflowInstance {
  id: string
  request_number: number
  definition_id: string
  title: string
  status: 'in_progress' | 'completed' | 'rejected' | 'cancelled'
  current_step_id: number | null
  created_by: string
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
  last_saved_at: string | null
}

export interface InstanceDetail extends WorkflowInstance {
  workflow_name: string
  workflow_config: WorkflowStep[]
  assignments: StepAssignment[]
}

export interface StepAssignment {
  id: string
  instance_id: string
  step_id: number
  assigned_to: string
  assigned_by: string
  assigned_at: string
}

export interface StepSubmission {
  id: string
  instance_id: string
  step_id: number
  submitted_by: string
  form_data: Record<string, unknown>
  status: 'draft' | 'submitted'
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface ReferenceListOption {
  label: string
  value: string
}

export interface ReferenceList {
  id: string
  list_name: string
  options: ReferenceListOption[]
  created_at: string
}

export interface Approval {
  id: string
  instance_id: string
  step_id: number
  approver_id: string
  approver_email: string | null
  decision: 'approved' | 'rejected' | null
  comment: string | null
  decided_at: string | null
  created_at: string
}

export interface PendingApproval extends Approval {
  instance_title: string
  workflow_name: string
  step_label: string
  submitted_by_email: string
}

export interface User {
  id: string
  supabase_id: string
  email: string
  full_name: string | null
  role: 'admin' | 'preparer' | 'reviewer' | 'approver'
  is_active: boolean
  created_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface GroupMember {
  user_id: string
  email: string
  full_name: string | null
}

export interface StepComment {
  id: string
  instance_id: string
  step_id: number
  author_id: string
  author_email: string
  author_name: string | null
  content: string
  created_at: string
}

export interface Notification {
  id: string
  comment_id: string
  instance_id: string
  step_id: number
  instance_title: string
  step_label: string
  comment_preview: string
  author_email: string
  is_read: boolean
  created_at: string
}
