import { useEffect } from 'react'
import { UseFormSetValue, UseFormWatch } from 'react-hook-form'
import type { FormField } from '@/types/workflow'
import { evaluateFormula, formatCalcResult } from '@/lib/calc-engine'

interface Props {
  field: FormField
  watch: UseFormWatch<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  crossStepValues?: Record<string, unknown>
}

export default function CalculatedField({ field, watch, setValue, crossStepValues }: Props) {
  const localValues = watch()

  // Merge cross-step values first, then local values override (current step has priority)
  const allValues = crossStepValues
    ? { ...crossStepValues, ...localValues }
    : localValues

  const result = field.formula
    ? evaluateFormula(field.formula, allValues as Record<string, unknown>)
    : 0

  // Keep the form value in sync so it's included in form_data on submit
  useEffect(() => {
    setValue(field.field_id, result)
  }, [result, field.field_id, setValue])

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{field.field_label}</label>
      <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-700">
        {formatCalcResult(result)}
      </div>
      <p className="text-xs text-gray-400">Auto-calculated: {field.formula}</p>
    </div>
  )
}
