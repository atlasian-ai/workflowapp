import { create } from 'zustand'
import type { StepConfig } from '@/components/admin/WorkflowBuilder'

interface AiStore {
  pendingWorkflow: StepConfig[] | null
  setPendingWorkflow: (steps: StepConfig[]) => void
  clearPendingWorkflow: () => void
}

export const useAiStore = create<AiStore>((set) => ({
  pendingWorkflow: null,
  setPendingWorkflow: (steps) => set({ pendingWorkflow: steps }),
  clearPendingWorkflow: () => set({ pendingWorkflow: null }),
}))
