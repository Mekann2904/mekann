/**
 * Validation utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - context-usage-dashboard.ts
 * - agent-usage-tracker.ts
 * - retry-with-backoff.ts
 * - loop.ts
 * - rsa.ts
 */

/**
 * Converts an unknown value to a finite number.
 * Returns undefined if the value is not a valid finite number.
 * @param value - The value to convert
 * @returns The finite number or undefined
 */
export function toFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/**
 * Converts an unknown value to a finite number with a default fallback.
 * @param value - The value to convert
 * @param fallback - The fallback value if conversion fails (default: 0)
 * @returns The finite number or fallback
 */
export function toFiniteNumberWithDefault(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

/**
 * Result type for bounded integer validation.
 */
export type BoundedIntegerResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validates and bounds an integer value.
 * @param value - The value to validate
 * @param fallback - The fallback value if undefined
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param field - Field name for error messages
 * @returns Validation result with value or error
 */
export function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): BoundedIntegerResult {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}

/**
 * Clamps an integer value to the specified range.
 * Uses Math.trunc to ensure integer result.
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped integer
 */
export function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Clamps a float value to the specified range.
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped float
 */
export function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
