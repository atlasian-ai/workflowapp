import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthInit } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import AdminUsers from '@/pages/admin/Users'
import AdminGroups from '@/pages/admin/Groups'
import AdminWorkflows from '@/pages/admin/Workflows'
import AdminReferenceLists from '@/pages/admin/ReferenceLists'
import Dashboard from '@/pages/user/Dashboard'
import WorkflowBrowse from '@/pages/user/WorkflowBrowse'
import InstanceDetail from '@/pages/user/InstanceDetail'
import Approvals from '@/pages/user/Approvals'
import Notifications from '@/pages/user/Notifications'
import Profile from '@/pages/Profile'

export default function App() {
  useAuthInit()
  useTheme() // applies saved theme on mount and listens for system preference changes

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            {/* User routes */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/workflows" element={<WorkflowBrowse />} />
            <Route path="/instances/:id" element={<InstanceDetail />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />

            {/* Admin routes */}
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/groups" element={<AdminGroups />} />
            <Route path="/admin/workflows" element={<AdminWorkflows />} />
            <Route path="/admin/reference-lists" element={<AdminReferenceLists />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
