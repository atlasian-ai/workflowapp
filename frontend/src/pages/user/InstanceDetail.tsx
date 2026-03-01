import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, XCircle, Lock, ShieldCheck, Ban, ChevronDown } from 'lucide-react'
import { getInstance, getSubmission, getAllSubmissions, saveDraft, submitStep, getStepApprovals, cancelInstance } from '@/lib/api'
import type { InstanceDetail, WorkflowStep, Approval } from '@/types/workflow'
import { useAuthStore } from '@/hooks/useAuth'
import { formatDate, statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import DynamicForm from '@/components/form-renderer/DynamicForm'
import StepComments from '@/components/user/StepComments'

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [activeStepId, setActiveStepId] = useState<number | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)

  const { data: instance, isLoading } = useQuery<InstanceDetail>({
    queryKey: ['instance', id],
    queryFn: () => getInstance(id!),
    enabled: !!id,
  })

  // Set active step to the current step when instance data first loads
  useEffect(() => {
    if (instance && !activeStepId && instance.current_step_id) {
      setActiveStepId(instance.current_step_id)
    }
  }, [instance, activeStepId])

  const activeStep = instance?.workflow_config?.find((s) => s.step_id === activeStepId)

  const { data: submission } = useQuery({
    queryKey: ['submission', id, activeStepId],
    queryFn: () => getSubmission(id!, activeStepId!),
    enabled: !!id && !!activeStepId,
  })

  const { data: approvals = [] } = useQuery<Approval[]>({
    queryKey: ['step-approvals', id, activeStepId],
    queryFn: () => getStepApprovals(id!, activeStepId!),
    enabled: !!id && !!activeStepId,
  })

  // Fetch all submitted form_data for cross-step calculated fields
  const { data: allSubmissions } = useQuery<Record<number, Record<string, unknown>>>({
    queryKey: ['all-submissions', id],
    queryFn: () => getAllSubmissions(id!),
    enabled: !!id,
  })

  // Flatten all submitted step form_data into one lookup (excluding current step's values
  // since DynamicForm's own watch() will supply those with higher priority)
  const crossStepValues: Record<string, unknown> = {}
  if (allSubmissions) {
    for (const [stepIdStr, formData] of Object.entries(allSubmissions)) {
      if (Number(stepIdStr) !== activeStepId) {
        Object.assign(crossStepValues, formData)
      }
    }
  }

  const draftMutation = useMutation({
    mutationFn: (formData: Record<string, unknown>) => saveDraft(id!, activeStepId!, formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission', id, activeStepId] }),
  })

  const submitMutation = useMutation({
    mutationFn: (formData: Record<string, unknown>) => submitStep(id!, activeStepId!, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instance', id] })
      qc.invalidateQueries({ queryKey: ['submission', id, activeStepId] })
      qc.invalidateQueries({ queryKey: ['step-approvals', id, activeStepId] })
      qc.invalidateQueries({ queryKey: ['all-submissions', id] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelInstance(id!),
    onSuccess: () => {
      setConfirmCancel(false)
      qc.invalidateQueries({ queryKey: ['instance', id] })
      qc.invalidateQueries({ queryKey: ['my-instances'] })
    },
  })

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">Loading…</div>
  }

  if (!instance) {
    return <div className="text-center py-12 text-red-500">Instance not found</div>
  }

  const getStepStatus = (step: WorkflowStep) => {
    const stepId = step.step_id
    if (instance.current_step_id === null && instance.status === 'completed') return 'completed'
    if (stepId < (instance.current_step_id ?? 0)) return 'completed'
    if (stepId === instance.current_step_id) return 'active'
    return 'pending'
  }

  const isStepReadOnly = (step: WorkflowStep) => {
    if (instance.status !== 'in_progress') return true
    const status = getStepStatus(step)
    if (status === 'pending') return true
    // Check if already submitted
    return submission?.status === 'submitted'
  }

  const pendingApproval = approvals.find((a) => !a.decision)
  const approvedApproval = approvals.find((a) => a.decision === 'approved')
  const rejectedApproval = approvals.find((a) => a.decision === 'rejected')

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <span className="flex-shrink-0 text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
            REQ_{instance.request_number}
          </span>
          <h2 className="text-xl font-bold text-gray-900 min-w-0 flex-1">{instance.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(instance.status))}>
              {instance.status.replace('_', ' ')}
            </span>
            {/* Cancel button — only shown to creator while in progress */}
            {instance.status === 'in_progress' && user?.id === instance.created_by && (
              confirmCancel ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-600">Cancel this request?</span>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 transition-colors"
                  >
                    {cancelMutation.isPending ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 hover:border-red-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Ban className="h-4 w-4" />
                  Cancel
                </button>
              )
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500">
          {instance.workflow_name} · Started {formatDate(instance.created_at)}
        </p>
      </div>

      {/* Completed read-only banner */}
      {instance.status === 'completed' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green-600" />
          <span>
            This workflow was completed on{' '}
            <strong>{formatDate(instance.completed_at)}</strong> and is now read-only.
            The form data is permanently locked.
          </span>
        </div>
      )}

      {/* Cancelled banner */}
      {instance.status === 'cancelled' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <Ban className="h-4 w-4 flex-shrink-0 text-gray-500" />
          <span>
            This request was cancelled on{' '}
            <strong>{formatDate(instance.cancelled_at)}</strong>.
            All further input is locked.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        {/* Step navigator */}
        <div className="md:w-52 md:flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Mobile: collapsible toggle */}
            <button
              className="md:hidden w-full flex items-center justify-between px-3 py-3 text-left border-b border-gray-100"
              onClick={() => setStepsOpen(!stepsOpen)}
            >
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</p>
                {activeStep && (
                  <p className="text-xs text-gray-600 mt-0.5 font-medium">{activeStep.step_label}</p>
                )}
              </div>
              <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform flex-shrink-0', stepsOpen && 'rotate-180')} />
            </button>
            {/* Desktop: always-visible header */}
            <div className="hidden md:block px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</p>
            </div>
            <ul className={cn('divide-y divide-gray-50', !stepsOpen && 'hidden md:block')}>
              {instance.workflow_config.map((step) => {
                const status = getStepStatus(step)
                const isActive = step.step_id === activeStepId

                return (
                  <li key={step.step_id}>
                    <button
                      onClick={() => { setActiveStepId(step.step_id); setStepsOpen(false) }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors',
                        isActive ? 'bg-blue-50' : 'hover:bg-gray-50',
                        status === 'pending' ? 'opacity-60' : ''
                      )}
                    >
                      <div className="flex-shrink-0">
                        {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                        {status === 'active' && <Clock className="h-4 w-4 text-blue-500" />}
                        {status === 'pending' && <Lock className="h-4 w-4 text-gray-300" />}
                      </div>
                      <div className="min-w-0">
                        <p className={cn('text-xs font-medium truncate', isActive ? 'text-blue-700' : 'text-gray-700')}>
                          {step.step_label}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">{status}</p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 min-w-0">
          {activeStep ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{activeStep.step_label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {activeStep.form_fields.length} fields
                    {activeStep.approvers.length > 0 && ` · Approvers: ${activeStep.approvers.join(', ')}`}
                  </p>
                </div>
                {submission?.status === 'submitted' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    Submitted
                  </span>
                )}
              </div>

              {/* Rejection banner — shown when the step was rejected and submission was
                  reset to draft (new flow). The user must edit and resubmit. */}
              {rejectedApproval && submission?.status !== 'submitted' && instance.status === 'in_progress' && (
                <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <p className="font-semibold">
                      Rejected by {rejectedApproval.approver_email ?? 'reviewer'}
                      {rejectedApproval.decided_at && ` on ${formatDate(rejectedApproval.decided_at)}`}
                    </p>
                    {rejectedApproval.comment && (
                      <p className="mt-0.5 italic">"{rejectedApproval.comment}"</p>
                    )}
                    <p className="mt-1 font-medium text-red-700">
                      Please update the form below and resubmit for approval.
                    </p>
                  </div>
                </div>
              )}

              {/* Submission status banner (shown while step is submitted / awaiting decision) */}
              {submission?.status === 'submitted' && (
                <div className="mb-5 rounded-lg border p-3">
                  {pendingApproval ? (
                    <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-lg p-3">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span>
                        Awaiting approval
                        {pendingApproval.approver_email && ` from ${pendingApproval.approver_email}`}
                      </span>
                    </div>
                  ) : approvedApproval ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <span>
                        Approved by {approvedApproval.approver_email ?? 'reviewer'}
                        {approvedApproval.decided_at && ` on ${formatDate(approvedApproval.decided_at)}`}
                        {approvedApproval.comment && ` — "${approvedApproval.comment}"`}
                      </span>
                    </div>
                  ) : rejectedApproval ? (
                    /* Legacy: old flow where rejection set instance.status = "rejected" */
                    <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                      <span>
                        Rejected by {rejectedApproval.approver_email ?? 'reviewer'}
                        {rejectedApproval.comment && ` — "${rejectedApproval.comment}"`}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              <DynamicForm
                step={activeStep}
                defaultValues={submission?.form_data as Record<string, unknown>}
                onSaveDraft={(data) => draftMutation.mutate(data)}
                onSubmit={(data) => submitMutation.mutate(data)}
                readOnly={isStepReadOnly(activeStep)}
                submitting={submitMutation.isPending}
                instanceId={instance.id}
                hasApprovers={activeStep.approvers.length > 0}
                crossStepValues={crossStepValues}
                lastSavedAt={submission?.status === 'draft' ? submission.updated_at : null}
              />

              <StepComments instanceId={instance.id} stepId={activeStep.step_id} />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-48 text-sm text-gray-400">
              Select a step above to begin
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
