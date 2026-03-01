import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Clock, CheckCircle2, XCircle, Ban, ArrowRight, RefreshCw } from 'lucide-react'
import { listInstances } from '@/lib/api'
import type { WorkflowInstance } from '@/types/workflow'
import { formatDate, formatKST, statusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'

export default function Dashboard() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data: instances = [], isLoading, isFetching, refetch } = useQuery<WorkflowInstance[]>({
    queryKey: ['my-instances'],
    queryFn: listInstances,
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 30_000,
  })

  const q = search.toLowerCase()
  const filtered = instances.filter(
    (i) =>
      !q ||
      i.title.toLowerCase().includes(q) ||
      String(i.request_number).includes(q) ||
      i.status.replace('_', ' ').includes(q)
  )

  const inProgress = instances.filter((i) => i.status === 'in_progress')
  const completed  = instances.filter((i) => i.status === 'completed')
  const rejected   = instances.filter((i) => i.status === 'rejected')
  const cancelled  = instances.filter((i) => i.status === 'cancelled')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Requests</h2>
          <p className="text-sm text-gray-500 mt-1">Workflow requests you have started</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'In Progress', count: inProgress.length, icon: <Clock className="h-5 w-5 text-blue-500" />, color: 'bg-blue-50' },
          { label: 'Completed',   count: completed.length,  icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, color: 'bg-green-50' },
          { label: 'Rejected',    count: rejected.length,   icon: <XCircle className="h-5 w-5 text-red-500" />,   color: 'bg-red-50' },
          { label: 'Cancelled',   count: cancelled.length,  icon: <Ban className="h-5 w-5 text-gray-400" />,  color: 'bg-gray-50' },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color} border border-gray-100`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.count}</p>
              </div>
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by title, REQ number or status…"
        className="mb-4"
      />

      {/* Instance list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : instances.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Clock className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No requests yet</p>
          <p className="text-sm text-gray-400 mt-1">Browse workflows and start a new request</p>
          <button
            onClick={() => navigate('/workflows')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Browse Workflows
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No requests match "<span className="font-medium">{search}</span>"
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inst) => (
            <div
              key={inst.id}
              onClick={() => navigate(`/instances/${inst.id}`)}
              className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 whitespace-nowrap">
                  REQ_{inst.request_number}
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{inst.title}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Started {formatDate(inst.created_at)}
                    {inst.current_step_id && ` · Step ${inst.current_step_id}`}
                  </p>
                  {inst.last_saved_at && inst.status === 'in_progress' && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      마지막 저장: {formatKST(inst.last_saved_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(inst.status))}>
                  {inst.status.replace('_', ' ')}
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
