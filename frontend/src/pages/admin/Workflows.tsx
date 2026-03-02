import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Archive, Edit2, ChevronDown, ChevronUp, Code, LayoutList, Eye, EyeOff } from 'lucide-react'
import SearchBar from '@/components/SearchBar'
import {
  listAdminWorkflows, createWorkflow, updateWorkflow,
  publishWorkflow, archiveWorkflow,
} from '@/lib/api'
import type { WorkflowDefinition } from '@/types/workflow'
import { formatDate, statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import WorkflowBuilder, { type StepConfig } from '@/components/admin/WorkflowBuilder'

export default function AdminWorkflows() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [builderSteps, setBuilderSteps] = useState<StepConfig[]>([])
  const [jsonText, setJsonText] = useState('')
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual')
  const [configError, setConfigError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingStatus, setEditingStatus] = useState<'draft' | 'published' | null>(null)
  const [lockedFieldIds, setLockedFieldIds] = useState<Set<string>>(new Set())

  const { data: workflows = [], isLoading } = useQuery<WorkflowDefinition[]>({
    queryKey: ['admin-workflows'],
    queryFn: listAdminWorkflows,
  })

  const createMutation = useMutation({
    mutationFn: (data: object) => editingId ? updateWorkflow(editingId, data) : createWorkflow(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workflows'] })
      resetForm()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setConfigError(msg)
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-workflows'] }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-workflows'] }),
  })

  // Save + publish in one step
  const saveAndPublishMutation = useMutation({
    mutationFn: async (data: object) => {
      const wf: WorkflowDefinition = editingId
        ? await updateWorkflow(editingId, data)
        : await createWorkflow(data)
      await publishWorkflow(wf.id)
      return wf
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workflows'] })
      resetForm()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setConfigError(msg)
    },
  })

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setEditingStatus(null)
    setLockedFieldIds(new Set())
    setFormName('')
    setFormDesc('')
    setBuilderSteps([])
    setJsonText('')
    setEditorMode('visual')
    setConfigError('')
  }

  const handleEdit = (wf: WorkflowDefinition) => {
    setEditingId(wf.id)
    setEditingStatus(wf.status as 'draft' | 'published')
    // Collect all existing field IDs — these are locked to prevent orphaning saved data
    const ids = new Set<string>()
    for (const step of wf.config as StepConfig[]) {
      for (const field of step.form_fields ?? []) {
        ids.add(field.field_id)
      }
    }
    setLockedFieldIds(ids)
    setFormName(wf.name)
    setFormDesc(wf.description ?? '')
    setBuilderSteps(wf.config as StepConfig[])
    setJsonText(JSON.stringify(wf.config, null, 2))
    setEditorMode('visual')
    setShowForm(true)
  }

  const switchMode = (mode: 'visual' | 'json') => {
    setConfigError('')
    if (mode === 'json' && editorMode === 'visual') {
      setJsonText(JSON.stringify(builderSteps, null, 2))
    } else if (mode === 'visual' && editorMode === 'json') {
      try {
        setBuilderSteps(JSON.parse(jsonText))
      } catch {
        setConfigError('Cannot switch: JSON has syntax errors. Fix them first.')
        return
      }
    }
    setEditorMode(mode)
  }

  const handleSave = () => {
    setConfigError('')
    let config: unknown
    if (editorMode === 'visual') {
      config = builderSteps
    } else {
      try {
        config = JSON.parse(jsonText)
      } catch {
        setConfigError('Invalid JSON — please fix the syntax')
        return
      }
    }
    if (!Array.isArray(config) || config.length === 0) {
      setConfigError('Workflow must have at least one step.')
      return
    }
    createMutation.mutate({ name: formName, description: formDesc, config })
  }

  const q = search.toLowerCase()
  const filtered = workflows.filter(
    (wf) =>
      !q ||
      wf.name.toLowerCase().includes(q) ||
      (wf.description ?? '').toLowerCase().includes(q) ||
      wf.status.toLowerCase().includes(q)
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Workflow Definitions</h2>
          <p className="text-sm text-gray-500 mt-1">Create and publish workflow templates</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Workflow
        </button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by name, description or status…"
        className="mb-5"
      />

      {/* Create / Edit form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Workflow' : 'New Workflow'}
          </h3>
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Procurement Request"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Editor mode tabs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Steps & Fields</label>
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                  <button
                    onClick={() => switchMode('visual')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
                      editorMode === 'visual'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <LayoutList className="h-3 w-3" /> Visual
                  </button>
                  <button
                    onClick={() => switchMode('json')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 border-l border-gray-200 transition-colors',
                      editorMode === 'json'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <Code className="h-3 w-3" /> JSON
                  </button>
                </div>
              </div>

              {editorMode === 'visual' ? (
                <WorkflowBuilder steps={builderSteps} onChange={setBuilderSteps} lockedFieldIds={lockedFieldIds} />
              ) : (
                <textarea
                  value={jsonText}
                  onChange={(e) => { setJsonText(e.target.value); setConfigError('') }}
                  rows={18}
                  spellCheck={false}
                  className={cn(
                    'w-full border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500',
                    configError ? 'border-red-400' : 'border-gray-300'
                  )}
                />
              )}

              {configError && (
                <p className="text-xs text-red-500 mt-1">{configError}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {editingStatus !== 'published' && (
                <button
                  onClick={() => {
                    setConfigError('')
                    let config: unknown
                    if (editorMode === 'visual') {
                      config = builderSteps
                    } else {
                      try { config = JSON.parse(jsonText) }
                      catch { setConfigError('Invalid JSON — please fix the syntax'); return }
                    }
                    if (!Array.isArray(config) || config.length === 0) {
                      setConfigError('Workflow must have at least one step.'); return
                    }
                    saveAndPublishMutation.mutate({ name: formName, description: formDesc, config })
                  }}
                  disabled={!formName.trim() || createMutation.isPending || saveAndPublishMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-4 w-4" />
                  {saveAndPublishMutation.isPending ? 'Publishing…' : 'Save & Publish'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!formName.trim() || createMutation.isPending || saveAndPublishMutation.isPending}
                className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Saving…' : editingStatus === 'published' ? 'Save Changes' : 'Save as Draft'}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((wf) => (
            <div key={wf.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between px-4 sm:px-5 py-3 gap-y-2">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setExpandedId(expandedId === wf.id ? null : wf.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {expandedId === wf.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{wf.name}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {wf.config.length} step{wf.config.length !== 1 ? 's' : ''} · Created {formatDate(wf.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(wf.status))}>
                    {wf.status}
                  </span>

                  {wf.status === 'draft' && (
                    <>
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <EyeOff className="h-3 w-3" />
                        <span className="hidden sm:inline">Hidden from users</span>
                      </span>
                      <button
                        onClick={() => handleEdit(wf)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => publishMutation.mutate(wf.id)}
                        disabled={publishMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50"
                        title="Publish to make visible in Browse Workflows"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Publish
                      </button>
                    </>
                  )}

                  {wf.status === 'published' && (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <Eye className="h-3 w-3" />
                        <span className="hidden sm:inline">Visible to users</span>
                      </span>
                      <button
                        onClick={() => handleEdit(wf)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => archiveMutation.mutate(wf.id)}
                        disabled={archiveMutation.isPending}
                        className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-md transition-colors"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandedId === wf.id && (
                <div className="border-t border-gray-100 px-4 sm:px-5 py-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Steps:</p>
                  <div className="space-y-2">
                    {wf.config.map((step) => (
                      <div key={step.step_id} className="flex items-start gap-3 text-sm">
                        <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold flex-shrink-0">
                          {step.step_id}
                        </div>
                        <div>
                          <span className="font-medium text-gray-800">{step.step_label}</span>
                          <span className="text-gray-400 ml-2 text-xs">
                            ({step.form_fields?.length ?? 0} fields)
                          </span>
                          {step.approvers?.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Approvers: {step.approvers.join(', ')}
                            </p>
                          )}
                          {/* Show dropdown options inline */}
                          {step.form_fields?.filter((f) => f.field_type === 'dropdown').map((f) => (
                            <p key={f.field_id} className="text-xs text-gray-400 mt-0.5">
                              {f.field_label}: {(f.options ?? []).join(' · ')}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <details className="mt-3">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">View JSON</summary>
                    <pre className="mt-2 text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700 border border-gray-200">
                      {JSON.stringify(wf.config, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}

          {workflows.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              No workflow definitions yet. Click "New Workflow" to create one.
            </div>
          )}
          {workflows.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No workflows match "<span className="font-medium">{search}</span>"
            </div>
          )}
        </div>
      )}
    </div>
  )
}
