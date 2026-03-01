import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Clock, Eye } from 'lucide-react'
import { getPendingApprovals, decideApproval } from '@/lib/api'
import type { PendingApproval } from '@/types/workflow'
import { formatDate } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'

export default function Approvals() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deciding, setDeciding] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [search, setSearch] = useState('')

  const { data: approvals = [], isLoading } = useQuery<PendingApproval[]>({
    queryKey: ['pending-approvals'],
    queryFn: getPendingApprovals,
    refetchInterval: 30000, // Poll every 30s
  })

  const decideMutation = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      decision,
      comment,
    }: {
      instanceId: string
      stepId: number
      decision: string
      comment?: string
    }) => decideApproval(instanceId, stepId, decision, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] })
      setDeciding(null)
      setComment('')
    },
  })

  const q = search.toLowerCase()
  const filtered = approvals.filter(
    (a) =>
      !q ||
      a.instance_title.toLowerCase().includes(q) ||
      a.workflow_name.toLowerCase().includes(q) ||
      a.step_label.toLowerCase().includes(q) ||
      a.submitted_by_email.toLowerCase().includes(q)
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
        <p className="text-sm text-gray-500 mt-1">Review and approve workflow submissions</p>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by title, workflow, step or submitter…"
        className="mb-5"
      />

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CheckCircle2 className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No pending approvals</p>
          <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No approvals match "<span className="font-medium">{search}</span>"
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((approval) => (
            <div key={approval.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{approval.instance_title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {approval.workflow_name} · <span className="font-medium">{approval.step_label}</span>
                  </p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-400">
                    <span>Submitted by {approval.submitted_by_email}</span>
                    <span className="hidden sm:inline">·</span>
                    <span>{formatDate(approval.created_at)}</span>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/instances/${approval.instance_id}`)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline flex-shrink-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Form
                </button>
              </div>

              {deciding === approval.id ? (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Comment (optional for approve, required for reject)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Add a comment…"
                      className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        decideMutation.mutate({
                          instanceId: approval.instance_id,
                          stepId: approval.step_id,
                          decision: 'approved',
                          comment: comment || undefined,
                        })
                      }
                      disabled={decideMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        if (!comment.trim()) {
                          alert('Please provide a reason for rejection')
                          return
                        }
                        decideMutation.mutate({
                          instanceId: approval.instance_id,
                          stepId: approval.step_id,
                          decision: 'rejected',
                          comment,
                        })
                      }}
                      disabled={decideMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => { setDeciding(null); setComment('') }}
                      className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setDeciding(approval.id)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    <Clock className="h-4 w-4" />
                    Review & Decide
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
