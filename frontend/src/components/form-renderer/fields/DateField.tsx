import { Controller } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import type { FormField } from '@/types/workflow'

interface Props {
  field: FormField
  control: Control<Record<string, unknown>>
  error?: string
  readOnly?: boolean
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function DateField({ field, control, error, readOnly }: Props) {
  const configDefault = field.default === 'today' ? todayISO() : ((field.default as string) ?? '')

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <Controller
        control={control}
        name={field.field_id}
        defaultValue={configDefault}
        rules={{
          required: field.required ? `${field.field_label} is required` : false,
        }}
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <input
            type="date"
            ref={ref}
            value={(value as string) ?? ''}
            onChange={onChange}
            onBlur={onBlur}
            readOnly={readOnly}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
              ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}
              ${error ? 'border-red-400' : 'border-gray-300'}`}
          />
        )}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
