import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api'
import type { Notification } from '@/types/workflow'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'

export default function NotificationsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: getNotifications,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })

  const handleClick = (n: Notification) => {
    if (!n.is_read) {
      markReadMutation.mutate(n.id)
    }
    navigate(`/instances/${n.instance_id}`)
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const q = search.toLowerCase()
  const filtered = notifications.filter(
    (n) =>
      !q ||
      n.author_email.toLowerCase().includes(q) ||
      n.instance_title.toLowerCase().includes(q) ||
      n.step_label.toLowerCase().includes(q) ||
      n.comment_preview.toLowerCase().includes(q)
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-gray-400" />
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by author, instance, step or comment…"
        className="mb-5"
      />

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No notifications yet</p>
          <p className="text-xs mt-1">You'll see a notification here when someone @mentions you in a comment.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No notifications match "<span className="font-medium">{search}</span>"
        </div>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3.5 transition-colors',
                  n.is_read
                    ? 'bg-white border-gray-200 hover:bg-gray-50'
                    : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {!n.is_read && (
                      <span className="block h-2 w-2 rounded-full bg-blue-600 mt-1" />
                    )}
                    {n.is_read && <span className="block h-2 w-2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 truncate max-w-[160px] sm:max-w-none">
                        {n.author_email}
                      </span>
                      <span className="text-xs text-gray-400">
                        mentioned you in <span className="font-medium text-gray-600">{n.instance_title}</span>
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      Step: {n.step_label}
                    </p>
                    <p className="text-sm text-gray-600 italic truncate">"{n.comment_preview}"</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-xs text-gray-400">{formatDate(n.created_at)}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
