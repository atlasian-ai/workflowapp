import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import type { WorkflowStep } from '@/types/workflow'
import { formatKST } from '@/lib/utils'
import TextField from './fields/TextField'
import TextareaField from './fields/TextareaField'
import NumberField from './fields/NumberField'
import DateField from './fields/DateField'
import DropdownField from './fields/DropdownField'
import RadioField from './fields/RadioField'
import CheckboxField from './fields/CheckboxField'
import FileUploadField from './fields/FileUploadField'
import OcrReaderField from './fields/OcrReaderField'
import CalculatedField from './fields/CalculatedField'
import TableField from './fields/TableField'

interface Props {
  step: WorkflowStep
  defaultValues?: Record<string, unknown>
  onSaveDraft: (data: Record<string, unknown>) => void
  onSubmit: (data: Record<string, unknown>) => void
  readOnly?: boolean
  submitting?: boolean
  instanceId?: string
  hasApprovers?: boolean
  crossStepValues?: Record<string, unknown>
  lastSavedAt?: string | null
}

export default function DynamicForm({
  step,
  defaultValues,
  onSaveDraft,
  onSubmit,
  readOnly = false,
  submitting = false,
  instanceId,
  hasApprovers = true,
  crossStepValues,
  lastSavedAt,
}: Props) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    control,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: defaultValues ?? {},
  })

  // Reset form when defaultValues first arrive (submission loads after component mounts)
  const resetDoneRef = useRef(false)
  useEffect(() => {
    if (defaultValues !== undefined && !resetDoneRef.current) {
      resetDoneRef.current = true
      reset(defaultValues)
    }
  }, [defaultValues, reset])

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="space-y-5">
        {step.form_fields.map((field) => {
          const error = errors[field.field_id]?.message as string | undefined

          switch (field.field_type) {
            case 'textbox':
              return (
                <TextField
                  key={field.field_id}
                  field={field}
                  register={register}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'textarea':
              return (
                <TextareaField
                  key={field.field_id}
                  field={field}
                  register={register}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'number':
              return (
                <NumberField
                  key={field.field_id}
                  field={field}
                  register={register}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'date':
              return (
                <DateField
                  key={field.field_id}
                  field={field}
                  control={control}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'dropdown':
              return (
                <DropdownField
                  key={field.field_id}
                  field={field}
                  control={control}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'radio':
              return (
                <RadioField
                  key={field.field_id}
                  field={field}
                  register={register}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'checkbox':
              return (
                <CheckboxField
                  key={field.field_id}
                  field={field}
                  register={register}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'file_upload':
              return (
                <FileUploadField
                  key={field.field_id}
                  field={field}
                  setValue={setValue}
                  currentValue={watch(field.field_id)}
                  error={error}
                  readOnly={readOnly}
                  instanceId={instanceId}
                  stepId={step.step_id}
                />
              )

            case 'ocr_reader':
              return (
                <OcrReaderField
                  key={field.field_id}
                  field={field}
                  setValue={setValue}
                  error={error}
                  readOnly={readOnly}
                />
              )

            case 'calculated':
              return (
                <CalculatedField
                  key={field.field_id}
                  field={field}
                  watch={watch}
                  setValue={setValue}
                  crossStepValues={crossStepValues}
                />
              )

            case 'table':
              return (
                <TableField
                  key={field.field_id}
                  field={field}
                  setValue={setValue}
                  currentValue={getValues(field.field_id) as Record<string, string | number>[]}
                  error={error}
                  readOnly={readOnly}
                />
              )

            default:
              return (
                <div key={field.field_id} className="text-xs text-gray-400">
                  Unknown field type: {field.field_type}
                </div>
              )
          }
        })}
      </div>

      {!readOnly && (
        <div className="pt-4 border-t border-gray-100">
          <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onSaveDraft(getValues())}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Save Draft
          </button>
          {hasApprovers && (
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </button>
          )}
          {!hasApprovers && (
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
          </div>
          {lastSavedAt && (
            <p className="mt-2 text-xs text-gray-400">
              마지막 저장: {formatKST(lastSavedAt)}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
