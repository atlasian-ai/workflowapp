/**
 * Threaded comment section for a single workflow step.
 * Renders existing comments and a MentionInput for new ones.
 * Comments are always visible (even on completed instances).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send } from 'lucide-react'
import { getComments, createComment, listMentionableUsers } from '@/lib/api'
import type { StepComment, User } from '@/types/workflow'
import { formatDate } from '@/lib/utils'
import MentionInput from '@/components/ui/MentionInput'

interface StepCommentsProps {
  instanceId: string
  stepId: number
}

/** Highlight @mentions inside comment content */
function CommentContent({ content }: { content: string }) {
  const parts = content.split(/(@\S+)/g)
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="text-blue-600 font-medium">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

export default function StepComments({ instanceId, stepId }: StepCommentsProps) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])

  const { data: comments = [] } = useQuery<StepComment[]>({
    queryKey: ['comments', instanceId, stepId],
    queryFn: () => getComments(instanceId, stepId),
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['mention-users'],
    queryFn: listMentionableUsers,
  })

  const postMutation = useMutation({
    mutationFn: () => createComment(instanceId, stepId, text, mentionedUserIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', instanceId, stepId] })
      setText('')
      setMentionedUserIds([])
    },
  })

  const handleMentionSelect = (userId: string) => {
    setMentionedUserIds((prev) => prev.includes(userId) ? prev : [...prev, userId])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    postMutation.mutate()
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-600">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
        </h4>
      </div>

      {/* Comment list */}
      {comments.length > 0 ? (
        <ul className="space-y-4 mb-5">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(c.author_name?.[0] ?? c.author_email[0]).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-800">
                    {c.author_name ?? c.author_email}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                  <CommentContent content={c.content} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 mb-5">No comments yet. Be the first to comment.</p>
      )}

      {/* New comment form */}
      <form onSubmit={handleSubmit}>
        <MentionInput
          value={text}
          onChange={setText}
          onMentionSelect={handleMentionSelect}
          users={users}
          placeholder="Add a comment… type @ to mention someone"
          disabled={postMutation.isPending}
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!text.trim() || postMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {postMutation.isPending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
