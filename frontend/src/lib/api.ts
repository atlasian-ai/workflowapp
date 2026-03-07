import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Attach Supabase JWT on every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const syncUser = (payload: { supabase_id: string; email: string; full_name?: string }) =>
  api.post('/auth/sync', payload).then((r) => r.data)

export const getMe = () => api.get('/auth/me').then((r) => r.data)
export const updateProfile = (data: { full_name: string }) =>
  api.put('/auth/profile', data).then((r) => r.data)

// ─── Admin — Users ────────────────────────────────────────────────────────────
export const listUsers = () => api.get('/admin/users').then((r) => r.data)
export const updateUser = (id: string, data: object) =>
  api.put(`/admin/users/${id}`, data).then((r) => r.data)
export const deactivateUser = (id: string) => api.delete(`/admin/users/${id}`)

// ─── Admin — Groups ───────────────────────────────────────────────────────────
export const listGroups = () => api.get('/admin/groups').then((r) => r.data)
export const createGroup = (data: { name: string; description?: string }) =>
  api.post('/admin/groups', data).then((r) => r.data)
export const deleteGroup = (id: string) => api.delete(`/admin/groups/${id}`)
export const listGroupMembers = (groupId: string) =>
  api.get(`/admin/groups/${groupId}/members`).then((r) => r.data)
export const addGroupMember = (groupId: string, userId: string) =>
  api.post(`/admin/groups/${groupId}/members`, { user_id: userId }).then((r) => r.data)
export const removeGroupMember = (groupId: string, userId: string) =>
  api.delete(`/admin/groups/${groupId}/members/${userId}`)

// ─── Admin — Workflows ────────────────────────────────────────────────────────
export const listAdminWorkflows = () => api.get('/admin/workflows').then((r) => r.data)
export const createWorkflow = (data: object) =>
  api.post('/admin/workflows', data).then((r) => r.data)
export const getWorkflow = (id: string) => api.get(`/admin/workflows/${id}`).then((r) => r.data)
export const updateWorkflow = (id: string, data: object) =>
  api.put(`/admin/workflows/${id}`, data).then((r) => r.data)
export const publishWorkflow = (id: string) =>
  api.post(`/admin/workflows/${id}/publish`).then((r) => r.data)
export const archiveWorkflow = (id: string) =>
  api.post(`/admin/workflows/${id}/archive`).then((r) => r.data)

// ─── Admin — Reference Lists ──────────────────────────────────────────────────
export const listAdminReferenceLists = () =>
  api.get('/admin/workflows/reference-lists').then((r) => r.data)
export const createReferenceList = (data: { list_name: string; options: { label: string; value: string }[] }) =>
  api.post('/admin/workflows/reference-lists', data).then((r) => r.data)
export const updateReferenceList = (id: string, data: { list_name: string; options: { label: string; value: string }[] }) =>
  api.put(`/admin/workflows/reference-lists/${id}`, data).then((r) => r.data)
export const deleteReferenceList = (id: string) =>
  api.delete(`/admin/workflows/reference-lists/${id}`)

// ─── User — Workflows ─────────────────────────────────────────────────────────
export const listPublishedWorkflows = () => api.get('/workflows').then((r) => r.data)
export const getReferenceList = (listName: string) =>
  api.get(`/workflows/reference-lists/${listName}`).then((r) => r.data)

// ─── User — Instances ─────────────────────────────────────────────────────────
export const createInstance = (data: { definition_id: string; title: string }) =>
  api.post('/instances', data).then((r) => r.data)
export const listInstances = () => api.get('/instances').then((r) => r.data)
export const getInstance = (id: string) => api.get(`/instances/${id}`).then((r) => r.data)
export const assignStep = (instanceId: string, stepId: number, assignedTo: string) =>
  api.put(`/instances/${instanceId}/steps/${stepId}/assign`, { assigned_to: assignedTo }).then((r) => r.data)
export const cancelInstance = (id: string) =>
  api.post(`/instances/${id}/cancel`).then((r) => r.data)

// ─── Submissions ──────────────────────────────────────────────────────────────
export const getAllSubmissions = (instanceId: string): Promise<Record<number, Record<string, unknown>>> =>
  api.get(`/instances/${instanceId}/all-submissions`).then((r) => r.data)
export const getSubmission = (instanceId: string, stepId: number) =>
  api.get(`/instances/${instanceId}/steps/${stepId}/submission`).then((r) => r.data)
export const saveDraft = (instanceId: string, stepId: number, formData: object) =>
  api.put(`/instances/${instanceId}/steps/${stepId}/submission`, { form_data: formData }).then((r) => r.data)
export const submitStep = (instanceId: string, stepId: number, formData: object) =>
  api.post(`/instances/${instanceId}/steps/${stepId}/submit`, { form_data: formData }).then((r) => r.data)

// ─── Approvals ────────────────────────────────────────────────────────────────
export const getPendingApprovals = () => api.get('/approvals/pending').then((r) => r.data)
export const decideApproval = (instanceId: string, stepId: number, decision: string, comment?: string) =>
  api.post(`/approvals/${instanceId}/steps/${stepId}`, { decision, comment }).then((r) => r.data)
export const getStepApprovals = (instanceId: string, stepId: number) =>
  api.get(`/approvals/${instanceId}/steps/${stepId}`).then((r) => r.data)

// ─── Users (for @mention lookup) ──────────────────────────────────────────────
export const listMentionableUsers = () => api.get('/users').then((r) => r.data)

// ─── Comments ─────────────────────────────────────────────────────────────────
export const getComments = (instanceId: string, stepId: number) =>
  api.get(`/instances/${instanceId}/steps/${stepId}/comments`).then((r) => r.data)
export const createComment = (instanceId: string, stepId: number, content: string, mentionedUserIds: string[]) =>
  api.post(`/instances/${instanceId}/steps/${stepId}/comments`, { content, mentioned_user_ids: mentionedUserIds }).then((r) => r.data)

// ─── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = () => api.get('/notifications').then((r) => r.data)
export const getUnreadCount = () => api.get('/notifications/unread-count').then((r) => r.data)
export const markNotificationRead = (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data)
export const markAllNotificationsRead = () => api.post('/notifications/read-all').then((r) => r.data)

// ─── AI Chat ──────────────────────────────────────────────────────────────────
export const sendAiChat = (
  message: string,
  mode: 'data_query' | 'workflow_builder',
  history: { role: string; content: string }[]
) => api.post('/ai/chat', { message, mode, history }).then((r) => r.data)

// ─── Files ────────────────────────────────────────────────────────────────────

/** Register a file that the frontend uploaded directly to Supabase Storage. */
export const registerFile = (payload: {
  storage_path: string
  file_name: string
  mime_type: string
  field_id: string
  instance_id?: string
  step_id?: number
}) => api.post('/files/register', payload).then((r) => r.data)

/**
 * Download a file from storage, streaming it through the backend.
 * Uses the existing axios instance (which injects the auth header automatically)
 * and triggers a browser file-save dialog.
 */
export const downloadFile = async (storagePath: string, fileName: string): Promise<void> => {
  const response = await api.get('/files/download', {
    params: { path: storagePath, name: fileName },
    responseType: 'blob',
  })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const uploadFile = (formData: FormData) =>
  api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const triggerOcr = (formData: FormData) =>
  api.post('/files/ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getOcrResult = (taskId: string) =>
  api.get(`/files/ocr/result/${taskId}`).then((r) => r.data)

export default api
