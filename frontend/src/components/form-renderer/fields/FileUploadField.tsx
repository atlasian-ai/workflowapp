import { useRef, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { Upload, X, FileText, Download, Loader2 } from 'lucide-react'
import type { FormField } from '@/types/workflow'
import { supabase, STORAGE_BUCKET } from '@/lib/supabase'
import { registerFile, downloadFile } from '@/lib/api'

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
}

// The form value is stored as { path, name }[] so original filenames
// survive page reloads and multiple files are supported.
interface FileEntry {
  path: string
  name: string
}

/** Parse the raw form value — handles array, single object, and legacy plain strings. */
function parseValue(raw: unknown): FileEntry[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((v) => v && typeof v === 'object' && 'path' in v) as FileEntry[]
  }
  if (typeof raw === 'object' && raw !== null && 'path' in raw) {
    return [raw as FileEntry]
  }
  if (typeof raw === 'string' && raw) {
    return [{ path: raw, name: raw.split('/').pop() ?? raw }]
  }
  return []
}

interface Props {
  field: FormField
  setValue: UseFormSetValue<Record<string, unknown>>
  currentValue?: unknown
  error?: string
  readOnly?: boolean
  instanceId?: string
  stepId?: number
}

export default function FileUploadField({
  field,
  setValue,
  currentValue,
  error,
  readOnly,
  instanceId,
  stepId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string>('')

  const acceptedExts = field.accepted_formats ?? ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx']
  const acceptAttr = acceptedExts
    .map((ext) => EXT_TO_MIME[ext.toLowerCase()] ?? `.${ext}`)
    .join(',')

  const fileEntries = parseValue(currentValue)

  const uploadSingle = async (file: File): Promise<FileEntry | null> => {
    if (file.size > MAX_BYTES) {
      setUploadError(
        `"${file.name}" is too large. Maximum size is 20 MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`
      )
      return null
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    const uid = crypto.randomUUID().replace(/-/g, '')
    // Use || (not ??) so an empty-string instanceId also falls back to 'anon'
    const instanceSeg = instanceId || 'anon'
    const fieldSeg = field.field_id || 'field'
    const path = `uploads/${instanceSeg}/${stepId ?? 0}/${fieldSeg}/${uid}${ext ? `.${ext}` : ''}`

    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (storageError) {
      setUploadError(`Upload failed for "${file.name}": ${storageError.message}`)
      return null
    }

    await registerFile({
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      field_id: field.field_id,
      instance_id: instanceId,
      step_id: stepId,
    })

    return { path, name: file.name }
  }

  const handleFiles = async (files: FileList) => {
    setUploadError('')
    setUploading(true)
    try {
      const existing = parseValue(currentValue)
      const newEntries: FileEntry[] = []
      for (const file of Array.from(files)) {
        const entry = await uploadSingle(file)
        if (entry) newEntries.push(entry)
      }
      if (newEntries.length > 0) {
        setValue(field.field_id, [...existing, ...newEntries])
      }
    } catch (e) {
      setUploadError('Upload failed — please try again.')
      console.error('Upload error', e)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDownload = async (entry: FileEntry) => {
    setDownloadingPath(entry.path)
    try {
      await downloadFile(entry.path, entry.name)
    } catch {
      setUploadError('Download failed — please try again.')
    } finally {
      setDownloadingPath(null)
    }
  }

  const handleRemove = (path: string) => {
    const updated = fileEntries.filter((e) => e.path !== path)
    setValue(field.field_id, updated.length > 0 ? updated : '')
    setUploadError('')
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Attached files list */}
      {fileEntries.length > 0 && (
        <div className="space-y-1.5">
          {fileEntries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-700 truncate flex-1" title={entry.name}>
                {entry.name}
              </span>

              <button
                type="button"
                onClick={() => handleDownload(entry)}
                disabled={downloadingPath === entry.path}
                title="Download file"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {downloadingPath === entry.path
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
              </button>

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemove(entry.path)}
                  title="Remove file"
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone — hidden in read-only mode */}
      {!readOnly && (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
          }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors select-none"
        >
          {uploading ? (
            <Loader2 className="mx-auto h-8 w-8 text-blue-500 mb-2 animate-spin" />
          ) : (
            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          )}
          <p className="text-sm text-gray-500">
            {uploading ? 'Uploading…' : 'Click or drag files here to upload'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {acceptedExts.map((e) => e.toUpperCase()).join(', ')} · max 20 MB each
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={acceptAttr}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
            }}
          />
        </div>
      )}

      {(uploadError || error) && (
        <p className="text-xs text-red-500">{uploadError || error}</p>
      )}
    </div>
  )
}
