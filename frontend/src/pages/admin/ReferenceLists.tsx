import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { listAdminReferenceLists, createReferenceList, updateReferenceList, deleteReferenceList } from '@/lib/api'
import type { ReferenceList, ReferenceListOption } from '@/types/workflow'
import SearchBar from '@/components/SearchBar'
import { cn } from '@/lib/utils'

interface EditState {
  listName: string
  options: ReferenceListOption[]
}

function buildEdit(list?: ReferenceList): EditState {
  return {
    listName: list?.list_name ?? '',
    options: list ? [...list.options] : [],
  }
}

export default function AdminReferenceLists() {
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState>({ listName: '', options: [] })
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [newOptionValue, setNewOptionValue] = useState('')
  const [error, setError] = useState('')

  const { data: lists = [], isLoading } = useQuery<ReferenceList[]>({
    queryKey: ['admin-reference-lists'],
    queryFn: listAdminReferenceLists,
  })

  const createMutation = useMutation({
    mutationFn: (data: EditState) =>
      createReferenceList({ list_name: data.listName, options: data.options }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reference-lists'] })
      setEditingId(null)
      setError('')
    },
    onError: () => setError('Failed to save — list name may already exist.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditState }) =>
      updateReferenceList(id, { list_name: data.listName, options: data.options }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reference-lists'] })
      setEditingId(null)
      setError('')
    },
    onError: () => setError('Failed to save — list name may already exist.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReferenceList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reference-lists'] }),
  })

  const startNew = () => {
    setEditingId('new')
    setEditState({ listName: '', options: [] })
    setNewOptionLabel('')
    setNewOptionValue('')
    setError('')
  }

  const startEdit = (list: ReferenceList) => {
    setEditingId(list.id)
    setEditState(buildEdit(list))
    setNewOptionLabel('')
    setNewOptionValue('')
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setError('')
  }

  const addOption = () => {
    const label = newOptionLabel.trim()
    const value = newOptionValue.trim() || label.toLowerCase().replace(/\s+/g, '_')
    if (!label) return
    setEditState((s) => ({ ...s, options: [...s.options, { label, value }] }))
    setNewOptionLabel('')
    setNewOptionValue('')
  }

  const removeOption = (i: number) => {
    setEditState((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))
  }

  const saveEdit = () => {
    setError('')
    if (!editState.listName.trim()) {
      setError('List name is required.')
      return
    }
    if (editState.options.length === 0) {
      setError('Add at least one option.')
      return
    }
    if (editingId === 'new') {
      createMutation.mutate(editState)
    } else if (editingId) {
      updateMutation.mutate({ id: editingId, data: editState })
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const q = search.toLowerCase()
  const filteredLists = lists.filter((l) => !q || l.list_name.toLowerCase().includes(q))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reference Lists</h2>
          <p className="text-sm text-gray-500 mt-1">
            Shared option lists (e.g. Departments, Products) used in workflow dropdowns
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> New List
        </button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search reference lists…"
        className="mb-5"
      />

      {/* New list form */}
      {editingId === 'new' && (
        <ListForm
          editState={editState}
          onEditState={setEditState}
          newOptionLabel={newOptionLabel}
          newOptionValue={newOptionValue}
          onNewOptionLabel={setNewOptionLabel}
          onNewOptionValue={setNewOptionValue}
          onAddOption={addOption}
          onRemoveOption={removeOption}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isSaving={isSaving}
          error={error}
          title="New Reference List"
        />
      )}

      {/* Lists */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {filteredLists.map((list) => (
            <div key={list.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {editingId === list.id ? (
                <div className="p-5">
                  <ListForm
                    editState={editState}
                    onEditState={setEditState}
                    newOptionLabel={newOptionLabel}
                    newOptionValue={newOptionValue}
                    onNewOptionLabel={setNewOptionLabel}
                    onNewOptionValue={setNewOptionValue}
                    onAddOption={addOption}
                    onRemoveOption={removeOption}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    isSaving={isSaving}
                    error={error}
                    title={`Edit "${list.list_name}"`}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => setExpandedId(expandedId === list.id ? null : list.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedId === list.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0">
                        <h4 className="font-medium text-gray-900">{list.list_name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {list.options.length} option{list.options.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(list)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(list.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {expandedId === list.id && (
                    <div className="border-t border-gray-100 px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        {list.options.map((opt) => (
                          <span
                            key={opt.value}
                            className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md"
                          >
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-gray-400">({opt.value})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {lists.length === 0 && editingId !== 'new' && (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
              No reference lists yet. Click "New List" to create one.
            </div>
          )}
          {lists.length > 0 && filteredLists.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No lists match "<span className="font-medium">{search}</span>"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ListForm({
  editState,
  onEditState,
  newOptionLabel,
  newOptionValue,
  onNewOptionLabel,
  onNewOptionValue,
  onAddOption,
  onRemoveOption,
  onSave,
  onCancel,
  isSaving,
  error,
  title,
}: {
  editState: EditState
  onEditState: (s: EditState) => void
  newOptionLabel: string
  newOptionValue: string
  onNewOptionLabel: (v: string) => void
  onNewOptionValue: (v: string) => void
  onAddOption: () => void
  onRemoveOption: (i: number) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  error: string
  title: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-3">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-4">
        {/* List name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">List Name</label>
          <input
            value={editState.listName}
            onChange={(e) => onEditState({ ...editState, listName: e.target.value })}
            placeholder="e.g. Departments"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Options ({editState.options.length})
          </label>
          <div className="space-y-1.5 mb-3">
            {editState.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5">
                <span className="flex-1 text-sm text-gray-800">{opt.label}</span>
                <span className="text-xs text-gray-400 font-mono">{opt.value}</span>
                <button
                  onClick={() => onRemoveOption(i)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add option row */}
          <div className="flex gap-2">
            <input
              value={newOptionLabel}
              onChange={(e) => onNewOptionLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddOption() } }}
              placeholder="Label (e.g. Finance)"
              className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <input
              value={newOptionValue}
              onChange={(e) => onNewOptionValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddOption() } }}
              placeholder="Value (auto-filled)"
              className="w-36 text-sm border border-gray-300 rounded-md px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={onAddOption}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Value is auto-generated from the label if left blank.
          </p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onSave}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors',
            )}
          >
            <Check className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
