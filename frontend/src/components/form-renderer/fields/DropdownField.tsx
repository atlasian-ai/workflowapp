import { useEffect, useState } from 'react'
import { useController, type Control } from 'react-hook-form'
import type { FormField } from '@/types/workflow'
import { getReferenceList } from '@/lib/api'

interface Props {
  field: FormField
  control: Control<Record<string, unknown>>
  error?: string
  readOnly?: boolean
}

export default function DropdownField({ field, control, error, readOnly }: Props) {
  const [options, setOptions] = useState<string[]>(field.options ?? [])

  useEffect(() => {
    if (field.options_source === 'list' && field.list_name) {
      getReferenceList(field.list_name)
        .then((data) => {
          const opts = (data.options as Array<{ label: string; value: string }>).map((o) => o.label)
          setOptions(opts)
        })
        .catch(() => {})
    }
  }, [field.list_name, field.options_source])

  const { field: controlled } = useController({
    name: field.field_id,
    control,
    rules: { required: field.required ? `${field.field_label} is required` : false },
    defaultValue: '',
  })

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        disabled={readOnly}
        {...controlled}
        value={(controlled.value as string) ?? ''}
        className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
          ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
          ${error ? 'border-red-400' : 'border-gray-300'}`}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
