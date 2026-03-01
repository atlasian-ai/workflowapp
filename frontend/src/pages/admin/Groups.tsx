import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, UserPlus, UserMinus } from 'lucide-react'
import SearchBar from '@/components/SearchBar'
import {
  listGroups, createGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember,
  listUsers,
} from '@/lib/api'
import type { Group, GroupMember, User } from '@/types/workflow'

export default function AdminGroups() {
  const qc = useQueryClient()
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingUserId, setAddingUserId] = useState('')
  const [search, setSearch] = useState('')

  const { data: groups = [] } = useQuery<Group[]>({ queryKey: ['admin-groups'], queryFn: listGroups })
  const { data: users = [] } = useQuery<User[]>({ queryKey: ['admin-users'], queryFn: listUsers })
  const { data: members = [] } = useQuery<GroupMember[]>({
    queryKey: ['group-members', selectedGroup?.id],
    queryFn: () => listGroupMembers(selectedGroup!.id),
    enabled: !!selectedGroup,
  })

  const createMutation = useMutation({
    mutationFn: () => createGroup({ name: newGroupName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); setNewGroupName('') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-groups'] }); setSelectedGroup(null) },
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      addGroupMember(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', selectedGroup?.id] })
      setAddingUserId('')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      removeGroupMember(groupId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-members', selectedGroup?.id] }),
  })

  const memberIds = new Set(members.map((m) => m.user_id))
  const nonMembers = users.filter((u) => !memberIds.has(u.id))

  const q = search.toLowerCase()
  const filteredGroups = groups.filter((g) => !q || g.name.toLowerCase().includes(q))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Groups</h2>
        <p className="text-sm text-gray-500 mt-1">Manage user groups for approval routing</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Groups list */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 space-y-2">
              <form onSubmit={(e) => { e.preventDefault(); if (newGroupName.trim()) createMutation.mutate() }}>
                <div className="flex gap-2">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name…"
                    className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!newGroupName.trim()}
                    className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </form>
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search groups…"
              />
            </div>
            <ul className="divide-y divide-gray-100">
              {filteredGroups.length === 0 && search ? (
                <li className="px-4 py-4 text-center text-xs text-gray-400">No groups match "{search}"</li>
              ) : null}
              {filteredGroups.map((group) => (
                <li
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors
                    ${selectedGroup?.id === group.id ? 'bg-blue-50' : ''}`}
                >
                  <span className={`text-sm font-medium ${selectedGroup?.id === group.id ? 'text-blue-700' : 'text-gray-800'}`}>
                    {group.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(group.id) }}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Members panel */}
        <div className="col-span-2">
          {selectedGroup ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Members of "{selectedGroup.name}"</h3>
                <select
                  value={addingUserId}
                  onChange={(e) => {
                    const userId = e.target.value
                    if (userId) {
                      addMemberMutation.mutate({ groupId: selectedGroup.id, userId })
                    }
                  }}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">+ Add member…</option>
                  {nonMembers.map((u) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </div>
              <ul className="divide-y divide-gray-100">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{m.email}</p>
                    </div>
                    <button
                      onClick={() => removeMemberMutation.mutate({ groupId: selectedGroup.id, userId: m.user_id })}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-gray-400">No members yet</li>
                )}
              </ul>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-48 text-sm text-gray-400">
              Select a group to manage its members
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
