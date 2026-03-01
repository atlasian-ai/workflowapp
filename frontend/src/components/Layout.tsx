import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Workflow, CheckSquare, Users, FolderTree, Settings, LogOut, Bell, List,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/hooks/useAuth'
import { getUnreadCount } from '@/lib/api'
import { cn } from '@/lib/utils'
import ForgeflowLogo from '@/components/ForgeflowLogo'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: 'My Requests', to: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Browse Workflows', to: '/workflows', icon: <Workflow className="h-4 w-4" /> },
  { label: 'Approvals', to: '/approvals', icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'Notifications', to: '/notifications', icon: <Bell className="h-4 w-4" /> },
]

const adminItems: NavItem[] = [
  { label: 'Users', to: '/admin/users', icon: <Users className="h-4 w-4" />, adminOnly: true },
  { label: 'Groups', to: '/admin/groups', icon: <FolderTree className="h-4 w-4" />, adminOnly: true },
  { label: 'Workflows', to: '/admin/workflows', icon: <Settings className="h-4 w-4" />, adminOnly: true },
  { label: 'Reference Lists', to: '/admin/reference-lists', icon: <List className="h-4 w-4" />, adminOnly: true },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
  )

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ['unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <ForgeflowLogo
            iconSize={28}
            showWordmark={true}
            textClass="text-lg font-bold text-blue-900 dark:text-blue-300 tracking-tight"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.email}</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={navLinkClass}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.to === '/notifications' && (unreadData?.count ?? 0) > 0 && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-medium leading-none">
                  {unreadData!.count}
                </span>
              )}
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <>
              <div className="px-3 pt-4 pb-1">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Admin
                </p>
              </div>
              {adminItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800">
          {/* User info — clicking navigates to Profile page */}
          <Link
            to="/profile"
            className="flex items-center gap-2 px-3 py-2 mb-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 uppercase">
              {user?.full_name?.[0] ?? user?.email?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.full_name ?? 'My Profile'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto dark:bg-gray-950">
        <div className="max-w-6xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
