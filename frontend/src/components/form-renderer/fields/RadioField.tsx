import { UseFormRegister } from 'react-hook-form'
import type { FormField } from '@/types/workflow'

interface Props {
  field: FormField
  register: UseFormRegister<Record<string, unknown>>
  error?: string
  readOnly?: boolean
}

export default function RadioField({ field, register, error, readOnly }: Props) {
  const options = field.options ?? []

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="space-y-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value={opt}
              disabled={readOnly}
              {...register(field.field_id, {
                required: field.required ? `${field.field_label} is required` : false,
              })}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{opt}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
