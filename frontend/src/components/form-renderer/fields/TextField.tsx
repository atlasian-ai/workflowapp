import { UseFormRegister } from 'react-hook-form'
import type { FormField } from '@/types/workflow'

interface Props {
  field: FormField
  register: UseFormRegister<Record<string, unknown>>
  error?: string
  readOnly?: boolean
}

export default function TextField({ field, register, error, readOnly }: Props) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        placeholder={field.placeholder ?? ''}
        readOnly={readOnly}
        {...register(field.field_id, { required: field.required ? `${field.field_label} is required` : false })}
        className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
          ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
          ${error ? 'border-red-400' : 'border-gray-300'}`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
