/**
 * Textarea with @mention autocomplete.
 *
 * When the user types '@' the component shows a dropdown of matching users.
 * Selecting a user inserts '@DisplayName ' at the cursor and records the userId.
 */
import { useRef, useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import type { User } from '@/types/workflow'
import { cn } from '@/lib/utils'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionSelect: (userId: string, displayName: string) => void
  users: User[]
  placeholder?: string
  disabled?: boolean
}

export default function MentionInput({
  value,
  onChange,
  onMentionSelect,
  users,
  placeholder,
  disabled,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null) // null = picker closed
  const [highlightIndex, setHighlightIndex] = useState(0)

  const filteredUsers = query === null
    ? []
    : users.filter((u) => {
        const q = query.toLowerCase()
        return (
          u.email.toLowerCase().includes(q) ||
          (u.full_name?.toLowerCase().includes(q) ?? false)
        )
      }).slice(0, 6)

  const insertMention = useCallback(
    (user: User) => {
      const ta = textareaRef.current
      if (!ta) return

      const displayName = user.full_name ?? user.email
      const cursorPos = ta.selectionStart ?? value.length

      // Find the '@' that opened this query
      const before = value.slice(0, cursorPos)
      const atIndex = before.lastIndexOf('@')
      if (atIndex === -1) return

      const newText = value.slice(0, atIndex) + `@${displayName} ` + value.slice(cursorPos)
      onChange(newText)
      onMentionSelect(user.id, displayName)
      setQuery(null)
      setHighlightIndex(0)

      // Move cursor to after the inserted mention
      const newCursor = atIndex + displayName.length + 2 // '@' + name + ' '
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(newCursor, newCursor)
      })
    },
    [value, onChange, onMentionSelect]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    onChange(text)

    const cursor = e.target.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setQuery(match[1])
      setHighlightIndex(0)
    } else {
      setQuery(null)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query === null || filteredUsers.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i + 1) % filteredUsers.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filteredUsers[highlightIndex])
    } else if (e.key === 'Escape') {
      setQuery(null)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className={cn(
          'w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:bg-gray-50 disabled:text-gray-400'
        )}
      />

      {query !== null && filteredUsers.length > 0 && (
        <ul className="absolute z-50 bottom-full mb-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {filteredUsers.map((user, idx) => (
            <li key={user.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault() // prevent textarea blur
                  insertMention(user)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  idx === highlightIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                )}
              >
                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(user.full_name?.[0] ?? user.email[0]).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{user.full_name ?? user.email}</p>
                  {user.full_name && <p className="text-xs text-gray-400 truncate">{user.email}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
