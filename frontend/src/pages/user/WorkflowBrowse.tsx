import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Workflow, ArrowRight, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { listPublishedWorkflows, createInstance, listInstances } from '@/lib/api'
import type { WorkflowDefinition, WorkflowInstance } from '@/types/workflow'
import { formatDate, statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'

export default function WorkflowBrowse() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')

  const { data: workflows = [], isLoading } = useQuery<WorkflowDefinition[]>({
    queryKey: ['published-workflows'],
    queryFn: listPublishedWorkflows,
  })

  const { data: myInstances = [] } = useQuery<WorkflowInstance[]>({
    queryKey: ['my-instances'],
    queryFn: listInstances,
  })

  const statusIcon = (status: WorkflowInstance['status']) => {
    if (status === 'completed') return <CheckCircle2 className="h-3 w-3 text-green-500" />
    if (status === 'rejected') return <XCircle className="h-3 w-3 text-red-500" />
    return <Clock className="h-3 w-3 text-blue-500" />
  }

  const createMutation = useMutation({
    mutationFn: ({ definitionId, title }: { definitionId: string; title: string }) =>
      createInstance({ definition_id: definitionId, title }),
    onSuccess: (instance) => {
      queryClient.invalidateQueries({ queryKey: ['my-instances'] })
      navigate(`/instances/${instance.id}`)
    },
  })

  const handleCreate = (wf: WorkflowDefinition) => {
    if (!title.trim()) return
    createMutation.mutate({ definitionId: wf.id, title: title.trim() })
  }

  const q = search.toLowerCase()
  const filtered = workflows.filter(
    (wf) =>
      !q ||
      wf.name.toLowerCase().includes(q) ||
      (wf.description ?? '').toLowerCase().includes(q)
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Available Workflows</h2>
        <p className="text-sm text-gray-500 mt-1">Select a workflow to start a new request</p>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search workflows by name or description…"
        className="mb-5"
      />

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Workflow className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500">No published workflows available yet</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No workflows match "<span className="font-medium">{search}</span>"
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((wf) => (
            <div key={wf.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Workflow className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{wf.name}</h3>
                  {wf.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{wf.description}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-4 text-xs text-gray-500 mb-4">
                <span>{wf.config.length} step{wf.config.length !== 1 ? 's' : ''}</span>
                <span>Published {formatDate(wf.published_at)}</span>
              </div>

              <div className="space-y-1 mb-4">
                {wf.config.map((step) => (
                  <div key={step.step_id} className="flex items-center gap-2 text-xs text-gray-600">
                    <div className="h-4 w-4 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium flex-shrink-0">
                      {step.step_id}
                    </div>
                    {step.step_label}
                  </div>
                ))}
              </div>

              {/* Existing requests for this workflow */}
              {(() => {
                const mine = myInstances.filter((i) => i.definition_id === wf.id)
                if (mine.length === 0) return null
                return (
                  <div className="mb-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Your requests</p>
                    <div className="space-y-1">
                      {mine.map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => navigate(`/instances/${inst.id}`)}
                          className="w-full flex items-center justify-between gap-2 text-xs bg-gray-50 hover:bg-blue-50 rounded-md px-2.5 py-2 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex-shrink-0 font-mono font-bold text-blue-700">REQ_{inst.request_number}</span>
                            <span className="truncate text-left text-gray-700">{inst.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {statusIcon(inst.status)}
                            <span className={cn('px-1.5 py-0.5 rounded-full font-medium', statusColor(inst.status))}>
                              {inst.status.replace('_', ' ')}
                            </span>
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {creating === wf.id ? (
                <div className="mt-auto space-y-2">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Give this request a title…"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(wf) }}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCreate(wf)}
                      disabled={!title.trim() || createMutation.isPending}
                      className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {createMutation.isPending ? 'Creating…' : 'Start'}
                    </button>
                    <button
                      onClick={() => { setCreating(null); setTitle('') }}
                      className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setCreating(wf.id); setTitle(wf.name + ' — ' + new Date().toLocaleDateString()) }}
                  className="mt-auto flex items-center justify-center gap-2 w-full py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-md hover:bg-blue-100 transition-colors"
                >
                  Start Request <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
