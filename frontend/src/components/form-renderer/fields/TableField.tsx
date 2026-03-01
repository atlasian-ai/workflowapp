import { useEffect, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import type { FormField, TableColumn } from '@/types/workflow'
import { evaluateFormula, formatCalcResult } from '@/lib/calc-engine'

type RowData = Record<string, string | number>

interface Props {
  field: FormField
  setValue: UseFormSetValue<Record<string, unknown>>
  currentValue?: RowData[]
  readOnly?: boolean
  error?: string
}

function CellInput({
  col,
  value,
  rowValues,
  onChange,
  readOnly,
}: {
  col: TableColumn
  value: string | number
  rowValues: RowData
  onChange: (v: string | number) => void
  readOnly: boolean
}) {
  if (col.col_type === 'calculated') {
    const result = col.formula ? evaluateFormula(col.formula, rowValues) : 0
    return (
      <div className="px-2 py-1.5 text-sm font-mono bg-gray-50 rounded border border-gray-200">
        {formatCalcResult(result)}
      </div>
    )
  }

  return (
    <input
      type={col.col_type === 'number' ? 'number' : 'text'}
      step="any"
      value={value as string}
      onChange={(e) =>
        onChange(col.col_type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)
      }
      disabled={readOnly}
      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
    />
  )
}

export default function TableField({ field, setValue, currentValue, readOnly = false, error }: Props) {
  const columns = field.columns ?? []

  const emptyRow = (): RowData =>
    Object.fromEntries(columns.map((c) => [c.col_id, c.col_type === 'number' ? 0 : '']))

  const [rows, setRows] = useState<RowData[]>(currentValue ?? [emptyRow()])

  // Sync rows to form value
  useEffect(() => {
    setValue(field.field_id, rows)
  }, [rows, field.field_id, setValue])

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx))

  const updateCell = (rowIdx: number, colId: string, value: string | number) => {
    setRows((prev) => {
      const updated = [...prev]
      updated[rowIdx] = { ...updated[rowIdx], [colId]: value }
      return updated
    })
  }

  // Compute calculated column values for each row (for display only)
  const getRowWithCalc = (row: RowData): RowData => {
    const enriched = { ...row }
    for (const col of columns) {
      if (col.col_type === 'calculated' && col.formula) {
        enriched[col.col_id] = evaluateFormula(col.formula, row)
      }
    }
    return enriched
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {field.field_label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <th key={col.col_id} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  {col.col_label}
                  {col.col_type === 'calculated' && (
                    <span className="ml-1 text-xs text-gray-400">(calc)</span>
                  )}
                </th>
              ))}
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, rowIdx) => {
              const rowWithCalc = getRowWithCalc(row)
              return (
                <tr key={rowIdx} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td key={col.col_id} className="px-2 py-1.5">
                      <CellInput
                        col={col}
                        value={col.col_type === 'calculated' ? rowWithCalc[col.col_id] : (row[col.col_id] ?? '')}
                        rowValues={rowWithCalc}
                        onChange={(v) => updateCell(rowIdx, col.col_id, v)}
                        readOnly={readOnly}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        disabled={rows.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Row
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
