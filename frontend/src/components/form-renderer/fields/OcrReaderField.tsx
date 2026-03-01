import { useRef, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { ScanLine, Loader2, CheckCircle2 } from 'lucide-react'
import type { FormField } from '@/types/workflow'
import { triggerOcr, getOcrResult } from '@/lib/api'

interface Props {
  field: FormField
  setValue: UseFormSetValue<Record<string, unknown>>
  error?: string
  readOnly?: boolean
}

type OcrStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function OcrReaderField({ field, setValue, error, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<OcrStatus>('idle')
  const [extractedData, setExtractedData] = useState<Record<string, unknown> | null>(null)

  const pollResult = async (taskId: string) => {
    const maxAttempts = 30
    let attempts = 0

    const poll = async (): Promise<void> => {
      attempts++
      const result = await getOcrResult(taskId)

      if (result.status === 'success') {
        setExtractedData(result.data)
        // Auto-populate sibling fields
        for (const [fieldId, value] of Object.entries(result.data as Record<string, unknown>)) {
          if (value !== null && value !== undefined) {
            setValue(fieldId, String(value))
          }
        }
        setStatus('done')
      } else if (result.status === 'error') {
        setStatus('error')
      } else if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000))
        await poll()
      } else {
        setStatus('error')
      }
    }

    setStatus('processing')
    await poll()
  }

  const handleFile = async (file: File) => {
    setStatus('uploading')
    setExtractedData(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('extract_fields', JSON.stringify(field.extract_fields ?? {}))

      const { task_id } = await triggerOcr(fd)
      await pollResult(task_id)
    } catch {
      setStatus('error')
    }
  }

  const acceptedMimes = (field.accepted_formats ?? ['pdf', 'png'])
    .map((ext) => {
      if (ext === 'pdf') return 'application/pdf'
      if (ext === 'png') return 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
      return `image/${ext}`
    })
    .join(',')

  const statusLabel: Record<OcrStatus, string> = {
    idle: 'Upload document to extract fields automatically',
    uploading: 'Uploading…',
    processing: 'Extracting data with AI…',
    done: 'Extraction complete — fields populated below',
    error: 'Extraction failed. Please fill fields manually.',
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
      </label>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ScanLine className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">AI Document Extraction</p>
            <p className="text-xs text-blue-600 mt-0.5">{statusLabel[status]}</p>
          </div>
          {status === 'done' && <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />}
          {(status === 'uploading' || status === 'processing') && (
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
          )}
        </div>

        {!readOnly && status !== 'processing' && status !== 'uploading' && (
          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
            >
              <ScanLine className="h-4 w-4" />
              {status === 'done' ? 'Re-extract' : 'Extract from Document'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={acceptedMimes}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        )}

        {extractedData && status === 'done' && (
          <div className="text-xs space-y-1 border-t border-blue-200 pt-2">
            {Object.entries(extractedData).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-medium text-blue-700 capitalize">{k.replace(/_/g, ' ')}:</span>
                <span className="text-blue-900">{v === null ? '—' : String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
