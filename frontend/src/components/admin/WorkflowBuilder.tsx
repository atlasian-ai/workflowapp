import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, ChevronDown, ChevronUp, Lock, GripVertical } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { listAdminReferenceLists } from '@/lib/api'
import { useAiStore } from '@/hooks/useAiStore'
import type { ReferenceList } from '@/types/workflow'

const FIELD_TYPES = [
  { value: 'textbox', label: 'Text Box' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file_upload', label: 'File Upload' },
  { value: 'ocr_reader', label: 'OCR Document Reader' },
  { value: 'calculated', label: 'Calculated' },
]

export interface FieldConfig {
  _id?: string          // internal DnD key — ephemeral, stripped before saving to DB
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
  accepted_formats?: string[]
  extract_fields?: Record<string, string>
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

// ─── FieldRow (sortable) ──────────────────────────────────────────────────────

function FieldRow({
  field,
  onChange,
  onDelete,
  referenceLists,
  fieldIdLocked,
  dragHandleProps,
  style,
  isDragging,
}: {
  field: FieldConfig
  onChange: (f: FieldConfig) => void
  onDelete: () => void
  referenceLists: ReferenceList[]
  fieldIdLocked?: boolean
  dragHandleProps?: Record<string, unknown>
  style?: React.CSSProperties
  isDragging?: boolean
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
    <div
      style={style}
      className={`border border-gray-200 rounded-lg bg-white overflow-hidden ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Field header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Drag handle */}
        <button
          type="button"
          className="flex-shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder"
          {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          <GripVertical className="h-4 w-4" />
        </button>
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
              extract_fields: t === 'ocr_reader' ? (field.extract_fields ?? {}) : undefined,
              accepted_formats: t === 'ocr_reader' ? (field.accepted_formats ?? ['pdf', 'png', 'jpg']) : undefined,
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
      {expanded && !isDragging && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-2 bg-gray-50">
          {/* Field ID */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 flex-shrink-0">Field ID</label>
            {fieldIdLocked ? (
              <div className="flex items-center gap-1.5 flex-1 border border-gray-200 rounded px-2 py-1 bg-gray-50">
                <span className="flex-1 text-xs font-mono text-gray-600">{field.field_id}</span>
                <span title="Field ID is locked — changing it would orphan saved data in active requests">
                  <Lock className="h-3 w-3 text-gray-400 flex-shrink-0" />
                </span>
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

          {/* OCR Document Reader configuration */}
          {field.field_type === 'ocr_reader' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20 flex-shrink-0">Formats</label>
                <div className="flex gap-3">
                  {(['pdf', 'png', 'jpg'] as const).map((fmt) => {
                    const formats = field.accepted_formats ?? ['pdf', 'png', 'jpg']
                    return (
                      <label key={fmt} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formats.includes(fmt)}
                          onChange={(e) => {
                            const current = field.accepted_formats ?? ['pdf', 'png', 'jpg']
                            const updated = e.target.checked
                              ? [...current, fmt]
                              : current.filter((f) => f !== fmt)
                            onChange({ ...field, accepted_formats: updated.length > 0 ? updated : ['pdf'] })
                          }}
                          className="h-3 w-3"
                        />
                        <span className="uppercase font-mono">{fmt}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    Fields to Extract{' '}
                    <span className="text-gray-400 font-normal">
                      ({Object.keys(field.extract_fields ?? {}).length}/10 · max 5-page documents)
                    </span>
                  </label>
                  {Object.keys(field.extract_fields ?? {}).length < 10 && (
                    <button
                      type="button"
                      onClick={() => {
                        const current = field.extract_fields ?? {}
                        let newKey = `field_${Object.keys(current).length + 1}`
                        while (newKey in current) newKey += '_'
                        onChange({ ...field, extract_fields: { ...current, [newKey]: '' } })
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Plus className="h-3 w-3" /> Add Field
                    </button>
                  )}
                </div>

                {Object.keys(field.extract_fields ?? {}).length > 0 && (
                  <div className="flex gap-2 mb-1 text-xs text-gray-400 px-0.5">
                    <span className="w-32 flex-shrink-0">Target Field ID</span>
                    <span className="flex-1">Description for AI</span>
                    <span className="w-5 flex-shrink-0" />
                  </div>
                )}

                <div className="space-y-1.5">
                  {Object.entries(field.extract_fields ?? {}).map(([key, desc], idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        value={key}
                        onChange={(e) => {
                          const entries = Object.entries(field.extract_fields ?? {})
                          entries[idx] = [e.target.value, desc]
                          onChange({ ...field, extract_fields: Object.fromEntries(entries) })
                        }}
                        placeholder="e.g. vendor_name"
                        className="w-32 flex-shrink-0 text-xs border border-gray-200 rounded px-2 py-1 font-mono bg-white"
                      />
                      <input
                        value={desc}
                        onChange={(e) => {
                          const entries = Object.entries(field.extract_fields ?? {})
                          entries[idx] = [key, e.target.value]
                          onChange({ ...field, extract_fields: Object.fromEntries(entries) })
                        }}
                        placeholder="e.g. vendor company name on the invoice"
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const entries = Object.entries(field.extract_fields ?? {}).filter((_, j) => j !== idx)
                          onChange({ ...field, extract_fields: Object.fromEntries(entries) })
                        }}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {Object.keys(field.extract_fields ?? {}).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Add at least one extraction field to enable document reading.
                  </p>
                )}

                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  <strong>Target Field ID</strong> must match another field's ID in this workflow —
                  that field will be auto-populated with the extracted value.{' '}
                  <strong>Description</strong> tells Claude what to look for
                  (e.g. "total invoice amount in AUD including tax").
                </p>
              </div>
            </div>
          )}

          {/* Dropdown options */}
          {field.field_type === 'dropdown' && (
            <div>
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

// Sortable wrapper for FieldRow
function SortableFieldRow(props: Parameters<typeof FieldRow>[0]) {
  const dndId = props.field._id || props.field.field_id
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <FieldRow
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  )
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

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
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  // Ensure all fields have a _id for DnD (fields loaded from DB may not have one)
  const fieldsWithIds = step.form_fields.map((f) =>
    f._id ? f : { ...f, _id: generateId() }
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const addField = () => {
    const newField: FieldConfig = {
      _id: generateId(),
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

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveFieldId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = step.form_fields.findIndex((f) => (f._id || f.field_id) === active.id)
    const newIndex = step.form_fields.findIndex((f) => (f._id || f.field_id) === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange({ ...step, form_fields: arrayMove(step.form_fields, oldIndex, newIndex) })
  }

  const activeField = activeFieldId ? fieldsWithIds.find((f) => f._id === activeFieldId) : null

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

          {/* Fields with DnD */}
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e) => setActiveFieldId(String(e.active.id))}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveFieldId(null)}
            >
              <SortableContext
                items={fieldsWithIds.map((f) => f._id!)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {fieldsWithIds.map((field, i) => (
                    <SortableFieldRow
                      key={field._id}
                      field={field}
                      onChange={(f) => updateField(i, f)}
                      onDelete={() => deleteField(i)}
                      referenceLists={referenceLists}
                      fieldIdLocked={lockedFieldIds?.has(field.field_id)}
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeField ? (
                  <FieldRow
                    field={activeField}
                    onChange={() => {}}
                    onDelete={() => {}}
                    referenceLists={referenceLists}
                    isDragging={false}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>

            {step.form_fields.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                No fields yet — click "Add Field" to add one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WorkflowBuilder (main export) ───────────────────────────────────────────

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

  // Load AI-generated workflow on mount
  const { pendingWorkflow, clearPendingWorkflow } = useAiStore()
  useEffect(() => {
    if (pendingWorkflow && pendingWorkflow.length > 0) {
      onChange(pendingWorkflow)
      clearPendingWorkflow()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
