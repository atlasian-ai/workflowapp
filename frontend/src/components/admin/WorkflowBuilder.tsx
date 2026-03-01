import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { listAdminReferenceLists } from '@/lib/api'
import type { ReferenceList } from '@/types/workflow'

const FIELD_TYPES = [
  { value: 'textbox', label: 'Text Box' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file_upload', label: 'File Upload' },
  { value: 'calculated', label: 'Calculated' },
]

export interface FieldConfig {
  field_id: string
  field_label: string
  field_type: string
  required: boolean
  placeholder?: string
  options?: string[]
  options_source?: 'inline' | 'list'
  list_name?: string
  default?: string
  formula?: string
}

export interface StepConfig {
  step_id: number
  step_name: string
  step_label: string
  approvers: string[]
  form_fields: FieldConfig[]
}

function generateId() {
  return 'f' + Math.random().toString(36).substring(2, 7)
}

function FieldRow({
  field,
  onChange,
  onDelete,
  referenceLists,
  fieldIdLocked,
}: {
  field: FieldConfig
  onChange: (f: FieldConfig) => void
  onDelete: () => void
  referenceLists: ReferenceList[]
  fieldIdLocked?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [newOption, setNewOption] = useState('')

  const optionsSource = field.options_source ?? 'inline'

  const addOption = () => {
    if (!newOption.trim()) return
    onChange({ ...field, options: [...(field.options ?? []), newOption.trim()] })
    setNewOption('')
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Field header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          value={field.field_label}
          onChange={(e) => onChange({ ...field, field_label: e.target.value })}
          placeholder="Field label"
          className="flex-1 text-sm font-medium text-gray-800 border-0 outline-none min-w-0"
        />
        <select
          value={field.field_type}
          onChange={(e) => {
            const t = e.target.value
            onChange({
              ...field,
              field_type: t,
              options: t === 'dropdown' ? (field.options ?? []) : undefined,
              formula: t === 'calculated' ? (field.formula ?? '') : undefined,
            })
          }}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="h-3 w-3"
          />
          Required
        </label>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          title={expanded ? 'Collapse' : 'Expand options'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 flex-shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-2 bg-gray-50">
          {/* Field ID */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0">Field ID</label>
            {fieldIdLocked ? (
              <div className="flex items-center gap-1.5 flex-1 border border-gray-200 rounded px-2 py-1 bg-gray-50">
                <span className="flex-1 text-xs font-mono text-gray-600">{field.field_id}</span>
                <Lock className="h-3 w-3 text-gray-400 flex-shrink-0" title="Field ID is locked — changing it would orphan saved data in active requests" />
              </div>
            ) : (
              <input
                value={field.field_id}
                onChange={(e) => onChange({ ...field, field_id: e.target.value })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 font-mono bg-white"
              />
            )}
          </div>

          {/* Placeholder (text/textarea/number) */}
          {['textbox', 'textarea', 'number'].includes(field.field_type) && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-20 flex-shrink-0">Placeholder</label>
              <input
                value={field.placeholder ?? ''}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                placeholder="Optional placeholder"
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              />
            </div>
          )}

          {/* Date default */}
          {field.field_type === 'date' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-20 flex-shrink-0">Default</label>
              <select
                value={field.default ?? ''}
                onChange={(e) => onChange({ ...field, default: e.target.value || undefined })}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                <option value="">No default</option>
                <option value="today">Today's date</option>
              </select>
            </div>
          )}

          {/* Formula (calculated fields) */}
          {field.field_type === 'calculated' && (
            <div className="flex items-start gap-2">
              <label className="text-xs text-gray-500 w-20 flex-shrink-0 pt-1.5">Formula</label>
              <div className="flex-1">
                <input
                  value={field.formula ?? ''}
                  onChange={(e) => onChange({ ...field, formula: e.target.value || undefined })}
                  placeholder="e.g. qty * unit_price"
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 font-mono bg-white"
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Reference other fields by their Field ID. Supports{' '}
                  <code className="bg-gray-100 px-0.5 rounded">+</code>{' '}
                  <code className="bg-gray-100 px-0.5 rounded">-</code>{' '}
                  <code className="bg-gray-100 px-0.5 rounded">*</code>{' '}
                  <code className="bg-gray-100 px-0.5 rounded">/</code>{' '}
                  and parentheses. Fields from any step in this workflow can be referenced.
                </p>
              </div>
            </div>
          )}

          {/* Dropdown options */}
          {field.field_type === 'dropdown' && (
            <div>
              {/* Source toggle */}
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-gray-500 w-20 flex-shrink-0">Source</label>
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => onChange({ ...field, options_source: 'inline', list_name: undefined })}
                    className={`px-3 py-1 transition-colors ${optionsSource === 'inline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Inline
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...field, options_source: 'list', options: undefined })}
                    className={`px-3 py-1 border-l border-gray-200 transition-colors ${optionsSource === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    From List
                  </button>
                </div>
              </div>

              {optionsSource === 'list' ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-20 flex-shrink-0">List</label>
                  <select
                    value={field.list_name ?? ''}
                    onChange={(e) => onChange({ ...field, list_name: e.target.value || undefined })}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
                  >
                    <option value="">— select a list —</option>
                    {referenceLists.map((rl) => (
                      <option key={rl.id} value={rl.list_name}>{rl.list_name}</option>
                    ))}
                  </select>
                  {referenceLists.length === 0 && (
                    <p className="text-xs text-amber-600">No reference lists yet. Create one in Admin → Reference Lists.</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Inline Options ({(field.options ?? []).length})
                  </label>
                  <div className="space-y-1">
                    {(field.options ?? []).map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={opt}
                          onChange={(e) => {
                            const opts = [...(field.options ?? [])]
                            opts[i] = e.target.value
                            onChange({ ...field, options: opts })
                          }}
                          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        />
                        <button
                          onClick={() =>
                            onChange({ ...field, options: (field.options ?? []).filter((_, j) => j !== i) })
                          }
                          className="text-gray-400 hover:text-red-500 flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {/* Add option row */}
                    <div className="flex gap-2 mt-1">
                      <input
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                        placeholder="Type option and press Enter or click Add"
                        className="flex-1 text-xs border border-blue-200 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-400 outline-none"
                      />
                      <button
                        onClick={addOption}
                        className="text-xs px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </div>
                    {(field.options ?? []).length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">⚠ Add at least one option for this dropdown.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({
  step,
  onChange,
  onDelete,
  referenceLists,
  lockedFieldIds,
}: {
  step: StepConfig
  onChange: (s: StepConfig) => void
  onDelete: () => void
  referenceLists: ReferenceList[]
  lockedFieldIds?: Set<string>
}) {
  const [expanded, setExpanded] = useState(true)

  const addField = () => {
    const newField: FieldConfig = {
      field_id: generateId(),
      field_label: 'New Field',
      field_type: 'textbox',
      required: false,
    }
    onChange({ ...step, form_fields: [...step.form_fields, newField] })
  }

  const updateField = (i: number, f: FieldConfig) => {
    const fields = [...step.form_fields]
    fields[i] = f
    onChange({ ...step, form_fields: fields })
  }

  const deleteField = (i: number) => {
    onChange({ ...step, form_fields: step.form_fields.filter((_, j) => j !== i) })
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Step header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {step.step_id}
        </div>
        <input
          value={step.step_label}
          onChange={(e) =>
            onChange({
              ...step,
              step_label: e.target.value,
              step_name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
            })
          }
          placeholder="Step label (e.g. Intake Form)"
          className="flex-1 text-sm font-semibold text-gray-800 border-0 outline-none"
        />
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500" title="Delete step">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-gray-50 space-y-3">
          {/* Approvers */}
          <div className="flex items-start gap-2">
            <label className="text-xs text-gray-500 w-24 flex-shrink-0 pt-1.5">Approvers</label>
            <div className="flex-1">
              <input
                value={step.approvers.join(', ')}
                onChange={(e) =>
                  onChange({
                    ...step,
                    approvers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                onBlur={(e) => {
                  // Normalise bare email addresses to "user:email" format on blur
                  const normalised = e.target.value
                    .split(',')
                    .map((s) => {
                      const v = s.trim()
                      if (!v) return ''
                      if (!v.startsWith('group:') && !v.startsWith('user:') && v.includes('@')) {
                        return `user:${v}`
                      }
                      return v
                    })
                    .filter(Boolean)
                  onChange({ ...step, approvers: normalised })
                }}
                placeholder="group:reviewers, user:email@example.com (comma-separated)"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Use <code className="bg-gray-100 px-1 rounded">group:name</code> or{' '}
                <code className="bg-gray-100 px-1 rounded">user:email</code>. Bare email addresses are also accepted. Leave empty for no approval required.
              </p>
            </div>
          </div>

          {/* Fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Form Fields ({step.form_fields.length})
              </label>
              <button
                onClick={addField}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-3 w-3" /> Add Field
              </button>
            </div>
            <div className="space-y-2">
              {step.form_fields.map((field, i) => (
                <FieldRow
                  key={field.field_id}
                  field={field}
                  onChange={(f) => updateField(i, f)}
                  onDelete={() => deleteField(i)}
                  referenceLists={referenceLists}
                  fieldIdLocked={lockedFieldIds?.has(field.field_id)}
                />
              ))}
              {step.form_fields.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                  No fields yet — click "Add Field" to add one.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkflowBuilder({
  steps,
  onChange,
  lockedFieldIds,
}: {
  steps: StepConfig[]
  onChange: (steps: StepConfig[]) => void
  lockedFieldIds?: Set<string>
}) {
  const { data: referenceLists = [] } = useQuery<ReferenceList[]>({
    queryKey: ['admin-reference-lists'],
    queryFn: listAdminReferenceLists,
  })

  const addStep = () => {
    const id = steps.length + 1
    onChange([
      ...steps,
      {
        step_id: id,
        step_name: `step_${id}`,
        step_label: `Step ${id}`,
        approvers: [],
        form_fields: [],
      },
    ])
  }

  const updateStep = (i: number, s: StepConfig) => {
    const updated = [...steps]
    updated[i] = s
    onChange(updated)
  }

  const deleteStep = (i: number) => {
    onChange(
      steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, step_id: j + 1 }))
    )
  }

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <StepRow
          key={`step-${i}`}
          step={step}
          onChange={(s) => updateStep(i, s)}
          onDelete={() => deleteStep(i)}
          referenceLists={referenceLists}
          lockedFieldIds={lockedFieldIds}
        />
      ))}
      {steps.length === 0 && (
        <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          No steps yet — click "Add Step" below to begin.
        </div>
      )}
      <button
        onClick={addStep}
        className="flex items-center gap-2 w-full justify-center px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Step
      </button>
    </div>
  )
}
