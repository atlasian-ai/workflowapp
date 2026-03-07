import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, X, Send, Loader2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendAiChat } from '@/lib/api'
import { useAiStore } from '@/hooks/useAiStore'
import type { StepConfig } from '@/components/admin/WorkflowBuilder'

interface Message {
  role: 'user' | 'assistant'
  content: string
  workflowDefinition?: StepConfig[] | null
}

export default function AiChatPanel() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { setPendingWorkflow } = useAiStore()

  const isWorkflowBuilderMode = location.pathname.startsWith('/admin/workflows')
  const mode = isWorkflowBuilderMode ? 'workflow_builder' : 'data_query'

  const modeLabel = isWorkflowBuilderMode ? 'Workflow Builder' : 'Data Query'
  const placeholder = isWorkflowBuilderMode
    ? 'Describe a workflow to build…'
    : 'Ask about your requests…'

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleClose = () => {
    setOpen(false)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      const res = await sendAiChat(text, mode, history)
      const assistantMsg: Message = {
        role: 'assistant',
        content: res.reply,
        workflowDefinition: res.workflow_definition ?? null,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApplyWorkflow = (steps: StepConfig[]) => {
    setPendingWorkflow(steps)
    setOpen(false)
    navigate('/admin/workflows')
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
          title="AI Assistant"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={handleClose}
          />

          <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl sm:w-[380px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">AI Assistant</p>
                  <p className="text-xs text-gray-400">{modeLabel} mode</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-xs text-gray-400 mt-8">
                  {isWorkflowBuilderMode
                    ? 'Describe a workflow and I\'ll generate the configuration for you.'
                    : 'Ask me anything about your requests and workflows.'}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    )}
                  >
                    {msg.role === 'assistant' && msg.workflowDefinition ? (
                      <div>
                        <p className="mb-2">Workflow generated! Click below to apply it to the builder.</p>
                        <button
                          onClick={() => handleApplyWorkflow(msg.workflowDefinition!)}
                          className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                          Apply to Builder
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 px-3 py-3 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">Enter to send · Shift+Enter for newline</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
