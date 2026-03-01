/**
 * Safe arithmetic formula evaluator for calculated fields.
 *
 * Formulas reference other field_ids: "f008 * f009"
 * Only +, -, *, /, (, ) and numeric literals are allowed.
 * No eval() — uses the Function constructor with strict mode and a whitelist check.
 */

/** Replace field ID references in formula with their numeric values. */
function resolveFieldRefs(
  formula: string,
  values: Record<string, unknown>,
): string {
  // Match identifiers like f001, c002, any_field_id
  return formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
    const raw = values[match]
    const num = parseFloat(String(raw ?? '0'))
    return isNaN(num) ? '0' : String(num)
  })
}

/** Validate that the resolved expression contains only safe arithmetic characters. */
function isSafeExpression(expr: string): boolean {
  return /^[\d\s+\-*/().]+$/.test(expr)
}

/**
 * Evaluate an arithmetic formula string.
 *
 * @param formula  Formula string, e.g. "f008 * f009" or "c002 * c003"
 * @param values   Record of field_id → current value (for the current form or table row)
 * @returns        Computed numeric result, or 0 on error
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, unknown>,
): number {
  try {
    const resolved = resolveFieldRefs(formula, values)
    if (!isSafeExpression(resolved)) return 0
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${resolved})`)()
    if (typeof result !== 'number' || !isFinite(result)) return 0
    return Math.round(result * 1e10) / 1e10 // avoid floating-point noise
  } catch {
    return 0
  }
}

/** Format a number for display (2 decimal places if fractional). */
export function formatCalcResult(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2)
}
